import { Router } from "express";
import { isValidObjectId, Types, type Model } from "mongoose";
import { z } from "zod";
import { authenticate, requirePermission, requireTenant } from "../identity/identity.middleware.js";
import { AssessmentEvent } from "../assessments/assessment.models.js";
import { FindingEvent } from "../findings/finding.models.js";
import { IncidentEvent } from "../incidents/incident.models.js";
import { ControlEvent } from "../compliance/compliance.models.js";
import { EvidenceEvent } from "../compliance/evidence.models.js";

export const auditRouter = Router();
auditRouter.use(authenticate, requireTenant);

const resourceTypes = ["assessment", "finding", "incident", "control", "evidence"] as const;
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  resourceType: z.enum(resourceTypes).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  actorId: z.string().refine(isValidObjectId, "Invalid actor identifier").optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).strict().refine(value => !value.from || !value.to || new Date(value.from) <= new Date(value.to), {
  message: "The from date must be earlier than or equal to the to date.",
  path: ["from"],
});

type SourceDefinition = {
  type: typeof resourceTypes[number];
  model: Model<any>;
  resourceField: string;
};

const sources: SourceDefinition[] = [
  { type: "assessment", model: AssessmentEvent, resourceField: "assessmentId" },
  { type: "finding", model: FindingEvent, resourceField: "findingId" },
  { type: "incident", model: IncidentEvent, resourceField: "incidentId" },
  { type: "control", model: ControlEvent, resourceField: "controlId" },
  { type: "evidence", model: EvidenceEvent, resourceField: "evidenceId" },
];

auditRouter.get("/events", requirePermission("reports:read"), async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_AUDIT_FILTER", message: "One or more audit filters are invalid.", details: parsed.error.flatten() } });
      return;
    }
    const { page, limit, resourceType, action, actorId, from, to } = parsed.data;
    const organizationId = new Types.ObjectId(req.tenant!.organizationId);
    const occurredAt: Record<string, Date> = {};
    if (from) occurredAt.$gte = new Date(from);
    if (to) occurredAt.$lte = new Date(to);
    const filter: Record<string, unknown> = { organizationId };
    if (action) filter.action = action;
    if (actorId) filter.actorId = new Types.ObjectId(actorId);
    if (Object.keys(occurredAt).length) filter.occurredAt = occurredAt;

    const selectedSources = sources.filter(source => !resourceType || source.type === resourceType);
    const perSourceLimit = page * limit;
    const results = await Promise.all(selectedSources.map(async source => {
      const [items, total] = await Promise.all([
        source.model.find(filter).sort({ occurredAt: -1, _id: -1 }).limit(perSourceLimit).populate("actorId", "name email").lean(),
        source.model.countDocuments(filter),
      ]);
      return { source, items: items as unknown as Record<string, any>[], total };
    }));

    const merged = results.flatMap(({ source, items }) => items.map(item => ({
      id: String(item._id),
      resourceType: source.type,
      resourceId: String(item[source.resourceField] ?? ""),
      action: String(item.action),
      actor: item.actorId && typeof item.actorId === "object"
        ? { id: String(item.actorId._id), name: item.actorId.name, email: item.actorId.email }
        : { id: String(item.actorId ?? ""), name: "Unknown user", email: "" },
      occurredAt: item.occurredAt,
      details: item.details ?? {},
    }))).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() || b.id.localeCompare(a.id));

    const total = results.reduce((sum, result) => sum + result.total, 0);
    const data = merged.slice((page - 1) * limit, page * limit);
    res.json({ data, meta: { page, limit, total, totalPages: Math.ceil(total / limit), resourceTypes: selectedSources.map(source => source.type) } });
  } catch (error) { next(error); }
});
