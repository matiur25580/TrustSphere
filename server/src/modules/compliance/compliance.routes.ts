import { Router } from "express";
import { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import { authenticate, requirePermission, requireTenant } from "../identity/identity.middleware.js";
import { ControlEvent, ControlImplementation } from "./compliance.models.js";

export const complianceRouter = Router();
complianceRouter.use(authenticate, requireTenant);

type CatalogControl = { id: string; title: string; objective: string; domain: string; mappings: { framework: string; reference: string }[] };
const controls: CatalogControl[] = [
  { id: "access-mfa", title: "Multi-factor authentication", objective: "Require MFA for privileged, remote and sensitive access.", domain: "Identity & access", mappings: [{ framework: "SOC 2", reference: "CC6.1" }, { framework: "ISO 27001:2022", reference: "A.8.5" }] },
  { id: "access-review", title: "Access provisioning and review", objective: "Approve, periodically review and promptly revoke access.", domain: "Identity & access", mappings: [{ framework: "SOC 2", reference: "CC6.2 / CC6.3" }, { framework: "ISO 27001:2022", reference: "A.5.15 / A.5.18" }] },
  { id: "security-policy", title: "Information security policy", objective: "Maintain an approved information security policy and review it periodically.", domain: "Governance", mappings: [{ framework: "SOC 2", reference: "CC1.1 / CC5.3" }, { framework: "ISO 27001:2022", reference: "A.5.1" }] },
  { id: "risk-assessment", title: "Risk assessment and treatment", objective: "Identify, assess, prioritize and treat information security risks.", domain: "Risk management", mappings: [{ framework: "SOC 2", reference: "CC3.1 / CC3.2" }, { framework: "ISO 27001:2022", reference: "A.5.4" }] },
  { id: "encryption", title: "Data encryption", objective: "Protect sensitive information in transit and at rest using approved cryptography.", domain: "Data protection", mappings: [{ framework: "SOC 2", reference: "CC6.7" }, { framework: "ISO 27001:2022", reference: "A.8.24" }] },
  { id: "logging-monitoring", title: "Logging and monitoring", objective: "Record security-relevant events and monitor for suspicious activity.", domain: "Detection & response", mappings: [{ framework: "SOC 2", reference: "CC7.2" }, { framework: "ISO 27001:2022", reference: "A.8.15 / A.8.16" }] },
  { id: "incident-response", title: "Incident management", objective: "Document, triage, respond to and learn from security incidents.", domain: "Resilience", mappings: [{ framework: "SOC 2", reference: "CC7.3 / CC7.4" }, { framework: "ISO 27001:2022", reference: "A.5.24–A.5.28" }] },
  { id: "backup-recovery", title: "Backup and recovery", objective: "Protect backups and test restoration against recovery objectives.", domain: "Resilience", mappings: [{ framework: "SOC 2", reference: "A1.2" }, { framework: "ISO 27001:2022", reference: "A.8.13" }] },
  { id: "supplier-security", title: "Supplier security management", objective: "Assess suppliers, define security requirements and monitor changes in risk.", domain: "Third-party risk", mappings: [{ framework: "SOC 2", reference: "CC9.2" }, { framework: "ISO 27001:2022", reference: "A.5.19–A.5.22" }] },
  { id: "change-management", title: "Change management", objective: "Authorize, test and record changes to systems and production services.", domain: "Engineering", mappings: [{ framework: "SOC 2", reference: "CC8.1" }, { framework: "ISO 27001:2022", reference: "A.8.32" }] },
];

const updateSchema = z.object({
  status: z.enum(["not_started", "in_progress", "implemented", "not_applicable"]),
  owner: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(3000).optional(),
  evidence: z.array(z.object({
    fileName: z.string().trim().min(1).max(180),
    mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "text/plain"]),
    sizeBytes: z.number().int().min(1).max(25 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    storageKey: z.string().regex(/^[a-zA-Z0-9/_-]+$/).max(240).refine(value => !value.includes("..") && !value.startsWith("/")),
  }).strict()).max(10).optional(),
}).strict();

complianceRouter.get("/frameworks", requirePermission("compliance:read"), (_req, res) => {
  const frameworks = ["SOC 2", "ISO 27001:2022"].map(name => ({
    id: name === "SOC 2" ? "soc2" : "iso27001-2022",
    name,
    controlCount: controls.filter(control => control.mappings.some(mapping => mapping.framework === name)).length,
    description: name === "SOC 2"
      ? "Starter crosswalk to selected Trust Services Criteria references."
      : "Starter crosswalk to selected Annex A controls from the 2022 edition.",
  }));
  res.json({ data: frameworks, meta: { catalogVersion: "trustsphere-control-catalog-v1", disclaimer: "Reference mappings are an implementation aid, not an official interpretation, audit opinion or certification." } });
});

complianceRouter.get("/summary", requirePermission("compliance:read"), async (req, res, next) => {
  try {
    const rows = await ControlImplementation.aggregate([
      { $match: { organizationId: new Types.ObjectId(req.tenant!.organizationId) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const counts = { not_started: 0, in_progress: 0, implemented: 0, not_applicable: 0 };
    for (const row of rows) counts[row._id as keyof typeof counts] = row.count;
    const total = controls.length;
    counts.not_started = Math.max(0, total - counts.in_progress - counts.implemented - counts.not_applicable);
    const applicable = total - counts.not_applicable;
    res.json({ data: { total, ...counts, coveragePercent: applicable ? Math.round(counts.implemented / applicable * 100) : 0, mappedFrameworks: 2 } });
  } catch (error) { next(error); }
});

complianceRouter.get("/controls", requirePermission("compliance:read"), async (req, res, next) => {
  try {
    const framework = typeof req.query.framework === "string" ? req.query.framework : "";
    const domain = typeof req.query.domain === "string" ? req.query.domain : "";
    if (framework && !["soc2", "iso27001-2022"].includes(framework)) {
      res.status(400).json({ error: { code: "INVALID_FRAMEWORK", message: "Choose a supported framework." } }); return;
    }
    const selected = controls.filter(control =>
      (!domain || control.domain === domain) &&
      (!framework || control.mappings.some(mapping => mapping.framework === (framework === "soc2" ? "SOC 2" : "ISO 27001:2022")))
    );
    const implementations = await ControlImplementation.find({
      organizationId: req.tenant!.organizationId,
      controlId: { $in: selected.map(control => control.id) },
    }).lean();
    const byId = new Map(implementations.map(item => [item.controlId, item]));
    res.json({ data: selected.map(control => ({ ...control, implementation: byId.get(control.id) ?? { status: "not_started", owner: "", notes: "", evidence: [] } })) });
  } catch (error) { next(error); }
});

complianceRouter.put("/controls/:controlId", requirePermission("compliance:write"), async (req, res, next) => {
  try {
    const control = controls.find(item => item.id === req.params.controlId);
    if (!control) { res.status(404).json({ error: { code: "CONTROL_NOT_FOUND", message: "Control not found in the current catalog." } }); return; }
    const input = updateSchema.parse(req.body);
    const prefix = `${req.tenant!.organizationId}/`;
    if (input.evidence?.some(item => !item.storageKey.startsWith(prefix))) {
      res.status(400).json({ error: { code: "INVALID_EVIDENCE_SCOPE", message: "Evidence keys must be namespaced to the active organization." } }); return;
    }
    const implementation = await ControlImplementation.findOneAndUpdate(
      { organizationId: req.tenant!.organizationId, controlId: control.id },
      { $set: { ...input, updatedBy: req.auth!.userId }, $setOnInsert: { organizationId: req.tenant!.organizationId, controlId: control.id } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    await ControlEvent.create({
      organizationId: req.tenant!.organizationId, controlId: control.id, actorId: req.auth!.userId,
      action: "implementation_updated", details: { status: implementation.status, evidenceCount: implementation.evidence.length },
    });
    res.json({ data: implementation });
  } catch (error) { next(error); }
});

complianceRouter.get("/controls/:controlId/events", requirePermission("compliance:read"), async (req, res, next) => {
  try {
    if (!controls.some(item => item.id === req.params.controlId)) { res.status(404).json({ error: { code: "CONTROL_NOT_FOUND", message: "Control not found." } }); return; }
    const events = await ControlEvent.find({ organizationId: req.tenant!.organizationId, controlId: req.params.controlId }).sort({ occurredAt: -1 }).limit(50).lean();
    res.json({ data: events });
  } catch (error) { next(error); }
});
