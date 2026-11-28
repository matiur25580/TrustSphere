import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { authenticate, requirePermission, requireTenant } from "../identity/identity.middleware.js";
import { Incident, IncidentEvent } from "../incidents/incident.models.js";
import { calculateIncidentSla } from "../incidents/incident-sla.js";
import { SecurityAlert } from "./alert.models.js";

export const alertRouter = Router();
alertRouter.use(authenticate, requireTenant);

const ingestSchema = z.object({
  source: z.enum(["siem", "edr", "cloud", "email_gateway", "manual", "other"]),
  sourceEventId: z.string().trim().min(1).max(180),
  title: z.string().trim().min(4).max(180),
  description: z.string().trim().min(10).max(4000),
  category: z.enum(["data_breach", "unauthorized_access", "malware", "service_disruption", "vendor_incident", "phishing", "policy_violation", "other"]),
  severity: z.enum(["p1", "p2", "p3", "p4"]),
}).strict();

alertRouter.post("/", requirePermission("security:write"), async (req, res, next) => {
  try {
    const input = ingestSchema.parse(req.body);
    const organizationId = req.tenant!.organizationId;
    const now = new Date();
    let alert;

    try {
      alert = await SecurityAlert.create({
        organizationId,
        ...input,
        receivedBy: req.auth!.userId,
        firstReceivedAt: now,
        lastReceivedAt: now,
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const existing = await SecurityAlert.findOneAndUpdate(
        { organizationId, source: input.source, sourceEventId: input.sourceEventId },
        { $inc: { occurrenceCount: 1 }, $set: { lastReceivedAt: now } },
        { new: true },
      ).lean();
      if (!existing) throw error;
      res.status(200).json({
        data: existing,
        duplicate: true,
        message: existing.incidentId ? "Duplicate alert correlated with the existing incident." : "Duplicate alert received; initial correlation is still processing.",
      });
      return;
    }

    const sla = calculateIncidentSla(input.severity, now);
    let incident;
    try {
      incident = await Incident.create({
        organizationId,
        title: input.title,
        summary: input.description,
        category: input.category,
        severity: input.severity,
        source: "automated",
        reportedAt: now,
        ...sla,
        createdBy: req.auth!.userId,
        updatedBy: req.auth!.userId,
      });
      await IncidentEvent.create({
        organizationId,
        incidentId: incident._id,
        actorId: req.auth!.userId,
        action: "created",
        details: { source: "alert_ingestion", alertId: String(alert._id), sourceEventId: input.sourceEventId },
        occurredAt: now,
      });
      alert.incidentId = incident._id as Types.ObjectId;
      await alert.save();
    } catch (error) {
      await SecurityAlert.deleteOne({ _id: alert._id, organizationId, incidentId: null }).catch(() => undefined);
      throw error;
    }

    res.status(201).json({ data: { alert, incident }, duplicate: false });
  } catch (error) { next(error); }
});

alertRouter.get("/", requirePermission("security:read"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const filter: Record<string, unknown> = { organizationId: req.tenant!.organizationId };
    if (typeof req.query.severity === "string" && ["p1", "p2", "p3", "p4"].includes(req.query.severity)) filter.severity = req.query.severity;
    if (typeof req.query.source === "string" && ["siem", "edr", "cloud", "email_gateway", "manual", "other"].includes(req.query.source)) filter.source = req.query.source;
    const [items, total] = await Promise.all([
      SecurityAlert.find(filter).sort({ lastReceivedAt: -1 }).skip((page - 1) * limit).limit(limit).populate("incidentId", "title severity status responseDueAt containmentDueAt resolutionDueAt").lean(),
      SecurityAlert.countDocuments(filter),
    ]);
    res.json({ data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});
