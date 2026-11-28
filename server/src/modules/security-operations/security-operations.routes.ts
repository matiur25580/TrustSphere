import { createHash } from "node:crypto";
import { Router } from "express";
import { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import { authenticate, requirePermission, requireTenant } from "../identity/identity.middleware.js";
import { Incident } from "../incidents/incident.models.js";
import { ComplianceEvidence } from "../compliance/evidence.models.js";
import { IncidentCustodyEvent, ResponsePlaybook, ResponsePlaybookEvent, ResponsePlaybookRun } from "./security-operations.models.js";

export const securityOperationsRouter = Router();
securityOperationsRouter.use(authenticate, requireTenant);

const ZERO_HASH = "0".repeat(64);
const custodySchema = z.object({
  evidenceId: z.string().refine(isValidObjectId),
  action: z.enum(["collected", "transferred", "accessed", "sealed", "unsealed", "exported"]),
  fromCustodian: z.string().trim().max(180).optional(),
  toCustodian: z.string().trim().max(180).optional(),
  location: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(2000).optional(),
}).strict();
const stepSchema = z.object({
  title: z.string().trim().min(3).max(120),
  instruction: z.string().trim().min(5).max(1000),
  actionType: z.enum(["manual_review", "notify_stakeholders", "preserve_evidence", "isolate_system", "rotate_credentials", "restore_service"]),
  required: z.boolean().default(true),
}).strict();
const playbookSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional(),
  category: z.enum(["data_breach", "unauthorized_access", "malware", "service_disruption", "vendor_incident", "phishing", "policy_violation", "other"]),
  severity: z.enum(["any", "p1", "p2", "p3", "p4"]).default("any"),
  active: z.boolean().default(true),
  steps: z.array(stepSchema).min(1).max(30),
}).strict().superRefine((value, ctx) => {
  const normalized = value.steps.map(step => step.title.toLowerCase());
  if (new Set(normalized).size !== normalized.length) ctx.addIssue({ code: "custom", message: "Step titles must be unique within a playbook.", path: ["steps"] });
});
const stepUpdateSchema = z.object({
  status: z.enum(["in_progress", "completed", "skipped"]),
  notes: z.string().trim().max(2000).optional(),
}).strict();

function hashCustodyEvent(input: { organizationId: string; incidentId: string; evidenceId: string; sequence: number; actorId: string; action: string; fromCustodian: string; toCustodian: string; location: string; notes: string; evidenceSha256: string; previousHash: string; occurredAt: string }) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function appendCustodyEvent(input: {
  organizationId: string; incidentId: string; evidenceId: string; actorId: string;
  action: z.infer<typeof custodySchema>["action"]; fromCustodian: string; toCustodian: string;
  location: string; notes: string; evidenceSha256: string;
}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const previous = await IncidentCustodyEvent.findOne({ organizationId: input.organizationId, incidentId: input.incidentId }).sort({ sequence: -1 }).lean() as unknown as { sequence: number; eventHash: string } | null;
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousHash = previous?.eventHash ?? ZERO_HASH;
    const occurredAt = new Date();
    const canonical = { ...input, sequence, previousHash, occurredAt: occurredAt.toISOString() };
    const eventHash = hashCustodyEvent(canonical);
    try {
      return await IncidentCustodyEvent.create({ ...input, sequence, previousHash, occurredAt, eventHash });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000 || attempt === 3) throw error;
    }
  }
  throw new Error("Unable to append custody event after concurrent writes.");
}

function verifyCustodyChain(events: Array<Record<string, any>>) {
  let previousHash = ZERO_HASH;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.sequence !== index + 1 || event.previousHash !== previousHash) return false;
    const expected = hashCustodyEvent({
      organizationId: String(event.organizationId), incidentId: String(event.incidentId), evidenceId: String(event.evidenceId),
      sequence: event.sequence, actorId: String(event.actorId), action: event.action, fromCustodian: event.fromCustodian ?? "",
      toCustodian: event.toCustodian ?? "", location: event.location ?? "", notes: event.notes ?? "",
      evidenceSha256: event.evidenceSha256, previousHash: event.previousHash, occurredAt: new Date(event.occurredAt).toISOString(),
    });
    if (expected !== event.eventHash) return false;
    previousHash = event.eventHash;
  }
  return true;
}

async function appendPlaybookEvent(input: { organizationId: string; incidentId: string; runId: string; actorId: string; action: "started" | "step_updated" | "completed" | "cancelled"; details?: Record<string, unknown> }) {
  await ResponsePlaybookEvent.create(input);
}

securityOperationsRouter.post("/incidents/:incidentId/chain-of-custody", requirePermission("security:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.incidentId)) { res.status(404).json({ error: { code: "INCIDENT_NOT_FOUND" } }); return; }
    const input = custodySchema.parse(req.body);
    const organizationId = req.tenant!.organizationId;
    const incidentId = String(req.params.incidentId);
    const incident = await Incident.findOne({ _id: incidentId, organizationId }).select("_id").lean() as unknown as { _id: Types.ObjectId } | null;
    if (!incident) { res.status(404).json({ error: { code: "INCIDENT_NOT_FOUND" } }); return; }
    const evidence = await ComplianceEvidence.findOne({ _id: input.evidenceId, organizationId }).select("_id sha256 status").lean() as unknown as { _id: Types.ObjectId; sha256: string; status: string } | null;
    if (!evidence) { res.status(404).json({ error: { code: "EVIDENCE_NOT_FOUND", message: "Evidence must exist in this organization before it can be added to the custody ledger." } }); return; }
    const event = await appendCustodyEvent({
      organizationId, incidentId, evidenceId: input.evidenceId, actorId: req.auth!.userId,
      action: input.action, fromCustodian: input.fromCustodian ?? "", toCustodian: input.toCustodian ?? "",
      location: input.location ?? "", notes: input.notes ?? "", evidenceSha256: evidence.sha256,
    });
    res.status(201).json({ data: event });
  } catch (error) { next(error); }
});

securityOperationsRouter.get("/incidents/:incidentId/chain-of-custody", requirePermission("security:read"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.incidentId)) { res.status(404).json({ error: { code: "INCIDENT_NOT_FOUND" } }); return; }
    const organizationId = req.tenant!.organizationId;
    const incident = await Incident.findOne({ _id: req.params.incidentId, organizationId }).select("_id").lean();
    if (!incident) { res.status(404).json({ error: { code: "INCIDENT_NOT_FOUND" } }); return; }
    const events = await IncidentCustodyEvent.find({ organizationId, incidentId }).sort({ sequence: 1 }).populate("actorId", "name email").lean();
    const raw = await IncidentCustodyEvent.find({ organizationId, incidentId }).sort({ sequence: 1 }).lean() as unknown as Array<Record<string, any>>;
    res.json({ data: events, integrity: { valid: verifyCustodyChain(raw as unknown as Array<Record<string, any>>), eventCount: raw.length, latestHash: raw.at(-1)?.eventHash ?? ZERO_HASH } });
  } catch (error) { next(error); }
});

securityOperationsRouter.get("/playbooks", requirePermission("security:read"), async (req, res, next) => {
  try {
    const data = await ResponsePlaybook.find({ organizationId: req.tenant!.organizationId }).sort({ name: 1 }).lean();
    res.json({ data });
  } catch (error) { next(error); }
});

securityOperationsRouter.post("/playbooks", requirePermission("security:write"), async (req, res, next) => {
  try {
    const input = playbookSchema.parse(req.body);
    const steps = input.steps.map((step, index) => ({ ...step, stepId: `step-${index + 1}` }));
    const data = await ResponsePlaybook.create({ ...input, steps, organizationId: req.tenant!.organizationId, createdBy: req.auth!.userId, updatedBy: req.auth!.userId });
    res.status(201).json({ data });
  } catch (error) { next(error); }
});

securityOperationsRouter.patch("/playbooks/:id", requirePermission("security:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { res.status(404).json({ error: { code: "PLAYBOOK_NOT_FOUND" } }); return; }
    const input = playbookSchema.parse(req.body);
    const update: Record<string, unknown> = { ...input, updatedBy: req.auth!.userId };
    if (input.steps) update.steps = input.steps.map((step, index) => ({ ...step, stepId: `step-${index + 1}` }));
    const data = await ResponsePlaybook.findOneAndUpdate({ _id: req.params.id, organizationId: req.tenant!.organizationId }, { $set: update }, { new: true, runValidators: true }).lean();
    if (!data) { res.status(404).json({ error: { code: "PLAYBOOK_NOT_FOUND" } }); return; }
    res.json({ data });
  } catch (error) { next(error); }
});

securityOperationsRouter.post("/playbooks/:id/start", requirePermission("security:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id) || !isValidObjectId(req.body?.incidentId)) { res.status(400).json({ error: { code: "INVALID_REFERENCE", message: "A valid playbook and incident identifier are required." } }); return; }
    const organizationId = req.tenant!.organizationId;
    const [playbookResult, incidentResult] = await Promise.all([
      ResponsePlaybook.findOne({ _id: String(req.params.id), organizationId, active: true }).lean(),
      Incident.findOne({ _id: String(req.body.incidentId), organizationId }).lean(),
    ]);
    const playbook = playbookResult as unknown as { _id: Types.ObjectId; name: string; category: string; severity: string; steps: Array<{ stepId: string; title: string; instruction: string; actionType: string; required: boolean }> } | null;
    const incident = incidentResult as unknown as { _id: Types.ObjectId; category: string; severity: string; status: string } | null;
    if (!playbook || !incident) { res.status(404).json({ error: { code: "PLAYBOOK_OR_INCIDENT_NOT_FOUND" } }); return; }
    if (playbook.category !== incident.category || (playbook.severity !== "any" && playbook.severity !== incident.severity)) {
      res.status(409).json({ error: { code: "PLAYBOOK_NOT_APPLICABLE", message: "The playbook category or severity does not match this incident." } }); return;
    }
    if (["resolved", "closed"].includes(incident.status)) { res.status(409).json({ error: { code: "INCIDENT_TERMINAL", message: "A playbook cannot be started for a resolved or closed incident." } }); return; }
    const run = await ResponsePlaybookRun.create({
      organizationId, incidentId: incident._id, playbookId: playbook._id, playbookName: playbook.name, startedBy: req.auth!.userId,
      steps: playbook.steps.map(step => ({ ...step, status: "pending", notes: "", completedBy: null, completedAt: null })),
    });
    await appendPlaybookEvent({ organizationId, incidentId: String(incident._id), runId: String(run._id), actorId: req.auth!.userId, action: "started", details: { playbookName: playbook.name, stepCount: playbook.steps.length } });
    res.status(201).json({ data: run });
  } catch (error) { next(error); }
});

securityOperationsRouter.patch("/playbook-runs/:runId/steps/:stepId", requirePermission("security:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.runId)) { res.status(404).json({ error: { code: "PLAYBOOK_RUN_NOT_FOUND" } }); return; }
    const input = stepUpdateSchema.parse(req.body);
    const run = await ResponsePlaybookRun.findOne({ _id: req.params.runId, organizationId: req.tenant!.organizationId });
    if (!run || run.status !== "in_progress") { res.status(404).json({ error: { code: "PLAYBOOK_RUN_NOT_FOUND" } }); return; }
    const steps = run.steps as unknown as Array<{ stepId: string; required: boolean; status: string; notes: string; completedBy: Types.ObjectId | null; completedAt: Date | null }>;
    const index = steps.findIndex((step: { stepId: string }) => step.stepId === String(req.params.stepId));
    if (index < 0) { res.status(404).json({ error: { code: "PLAYBOOK_STEP_NOT_FOUND" } }); return; }
    if (input.status === "in_progress" && steps.slice(0, index).some((step: { required: boolean; status: string }) => step.required && !["completed", "skipped"].includes(step.status))) {
      res.status(409).json({ error: { code: "PLAYBOOK_STEP_ORDER", message: "Complete or explicitly skip earlier required steps first." } }); return;
    }
    const step = steps[index];
    step.status = input.status;
    step.notes = input.notes ?? step.notes;
    if (input.status === "completed" || input.status === "skipped") { step.completedBy = new Types.ObjectId(req.auth!.userId); step.completedAt = new Date(); }
    else { step.completedBy = null; step.completedAt = null; }
    const finished = steps.every((item: { required: boolean; status: string }) => !item.required || ["completed", "skipped"].includes(item.status));
    if (finished) { run.status = "completed"; run.completedAt = new Date(); }
    await run.save();
    await appendPlaybookEvent({ organizationId: req.tenant!.organizationId, incidentId: String(run.incidentId), runId: String(run._id), actorId: req.auth!.userId, action: finished ? "completed" : "step_updated", details: { stepId: step.stepId, status: step.status, notes: step.notes } });
    res.json({ data: run });
  } catch (error) { next(error); }
});

securityOperationsRouter.get("/incidents/:incidentId/playbook-runs", requirePermission("security:read"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.incidentId)) { res.status(404).json({ error: { code: "INCIDENT_NOT_FOUND" } }); return; }
    const incident = await Incident.findOne({ _id: req.params.incidentId, organizationId: req.tenant!.organizationId }).select("_id").lean();
    if (!incident) { res.status(404).json({ error: { code: "INCIDENT_NOT_FOUND" } }); return; }
    const data = await ResponsePlaybookRun.find({ organizationId: req.tenant!.organizationId, incidentId: req.params.incidentId }).sort({ createdAt: -1 }).lean();
    res.json({ data });
  } catch (error) { next(error); }
});

securityOperationsRouter.get("/incidents/:incidentId/playbook-events", requirePermission("security:read"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.incidentId)) { res.status(404).json({ error: { code: "INCIDENT_NOT_FOUND" } }); return; }
    const incident = await Incident.findOne({ _id: req.params.incidentId, organizationId: req.tenant!.organizationId }).select("_id").lean();
    if (!incident) { res.status(404).json({ error: { code: "INCIDENT_NOT_FOUND" } }); return; }
    const data = await ResponsePlaybookEvent.find({ organizationId: req.tenant!.organizationId, incidentId: req.params.incidentId }).sort({ occurredAt: -1 }).populate("actorId", "name email").lean();
    res.json({ data });
  } catch (error) { next(error); }
});
