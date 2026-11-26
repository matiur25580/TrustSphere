import { Router } from "express";
import { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import { authenticate, requirePermission, requireTenant } from "../identity/identity.middleware.js";
import { Membership } from "../identity/identity.models.js";
import { Vendor } from "../vendors/vendor.models.js";
import { Finding } from "../findings/finding.models.js";
import { Incident, IncidentEvent } from "./incident.models.js";

export const incidentRouter = Router();
incidentRouter.use(authenticate, requireTenant);

const categories = ["data_breach", "unauthorized_access", "malware", "service_disruption", "vendor_incident", "phishing", "policy_violation", "other"] as const;
const sources = ["internal", "vendor", "customer", "automated", "other"] as const;
const createSchema = z.object({
  title: z.string().trim().min(4).max(180),
  summary: z.string().trim().min(10).max(4000),
  category: z.enum(categories),
  severity: z.enum(["p1", "p2", "p3", "p4"]),
  source: z.enum(sources).default("internal"),
  vendorId: z.string().refine(value => value === "" || isValidObjectId(value)).optional(),
  findingId: z.string().refine(value => value === "" || isValidObjectId(value)).optional(),
  assignedTo: z.string().refine(value => value === "" || isValidObjectId(value)).optional(),
  detectedAt: z.string().datetime().optional(),
  impact: z.string().trim().max(3000).optional(),
}).strict();
const updateSchema = z.object({
  title: z.string().trim().min(4).max(180).optional(),
  summary: z.string().trim().min(10).max(4000).optional(),
  category: z.enum(categories).optional(),
  severity: z.enum(["p1", "p2", "p3", "p4"]).optional(),
  source: z.enum(sources).optional(),
  assignedTo: z.string().refine(value => value === "" || isValidObjectId(value)).nullable().optional(),
  detectedAt: z.string().datetime().nullable().optional(),
  impact: z.string().trim().max(3000).optional(),
  rootCause: z.string().trim().max(3000).optional(),
  containmentPlan: z.string().trim().max(3000).optional(),
  recoveryPlan: z.string().trim().max(3000).optional(),
  lessonsLearned: z.string().trim().max(3000).optional(),
}).strict().refine(value => Object.keys(value).length > 0, "Provide at least one field to update");
const transitionSchema = z.object({ action: z.enum(["triage", "investigate", "contain", "recover", "resolve", "close", "reopen"]), comment: z.string().trim().max(2000).optional() }).strict();
const commentSchema = z.object({ comment: z.string().trim().min(2).max(2000) }).strict();

function isReviewer(role: string) { return role === "owner" || role === "admin"; }
function notFound(res: import("express").Response) {
  res.status(404).json({ error: { code: "INCIDENT_NOT_FOUND", message: "Incident not found in this organization." } });
}
async function appendEvent(input: { organizationId: string; incidentId: string; actorId: string; action: "created" | "details_updated" | "assigned" | "triaged" | "investigation_started" | "contained" | "recovery_started" | "resolved" | "closed" | "reopened" | "comment_added"; details?: Record<string, unknown> }) {
  await IncidentEvent.create(input);
}
async function validateLinks(organizationId: string, input: { vendorId?: string; findingId?: string; assignedTo?: string | null }) {
  if (input.vendorId) {
    const vendor = await Vendor.findOne({ _id: input.vendorId, organizationId, archivedAt: null }).select("_id").lean();
    if (!vendor) return "The selected vendor does not exist in this organization.";
  }
  if (input.findingId) {
    const finding = await Finding.findOne({ _id: input.findingId, organizationId }).select("_id vendorId").lean();
    if (!finding) return "The selected finding does not exist in this organization.";
    if (input.vendorId && String(finding.vendorId) !== input.vendorId) return "The linked finding belongs to a different vendor.";
  }
  if (input.assignedTo) {
    const membership = await Membership.findOne({ userId: input.assignedTo, organizationId, status: "active" }).select("_id").lean();
    if (!membership) return "The assignee must be an active member of this organization.";
  }
  return null;
}

incidentRouter.get("/members", requirePermission("security:read"), async (req, res, next) => {
  try {
    const members = await Membership.find({ organizationId: req.tenant!.organizationId, status: "active" })
      .populate("userId", "name email").sort({ createdAt: 1 }).lean();
    res.json({ data: members.map(member => {
      const user = member.userId as unknown as { _id: Types.ObjectId; name: string; email: string };
      return { id: String(user._id), name: user.name, email: user.email, role: member.role };
    }) });
  } catch (error) { next(error); }
});

incidentRouter.get("/summary", requirePermission("security:read"), async (req, res, next) => {
  try {
    const organizationId = new Types.ObjectId(req.tenant!.organizationId);
    const [rows, severityRows] = await Promise.all([
      Incident.aggregate([
        { $match: { organizationId } },
        { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $not: [{ $in: ["$status", ["resolved", "closed"]] }] }, 1, 0] } }, critical: { $sum: { $cond: [{ $and: [{ $eq: ["$severity", "p1"] }, { $not: [{ $in: ["$status", ["resolved", "closed"]] }] }] }, 1, 0] } }, investigating: { $sum: { $cond: [{ $eq: ["$status", "investigating"] }, 1, 0] } }, contained: { $sum: { $cond: [{ $eq: ["$status", "contained"] }, 1, 0] } }, resolved: { $sum: { $cond: [{ $in: ["$status", ["resolved", "closed"]] }, 1, 0] } } } },
      ]),
      Incident.aggregate([{ $match: { organizationId } }, { $group: { _id: "$severity", count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    ]);
    res.json({ data: { ...(rows[0] ?? { total: 0, active: 0, critical: 0, investigating: 0, contained: 0, resolved: 0 }), bySeverity: severityRows.map(row => ({ severity: row._id, count: row.count })) } });
  } catch (error) { next(error); }
});

incidentRouter.get("/", requirePermission("security:read"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const filter: Record<string, unknown> = { organizationId: req.tenant!.organizationId };
    if (typeof req.query.status === "string" && ["reported", "triaged", "investigating", "contained", "recovering", "resolved", "closed"].includes(req.query.status)) filter.status = req.query.status;
    if (typeof req.query.severity === "string" && ["p1", "p2", "p3", "p4"].includes(req.query.severity)) filter.severity = req.query.severity;
    if (typeof req.query.category === "string" && categories.includes(req.query.category as typeof categories[number])) filter.category = req.query.category;
    if (typeof req.query.q === "string" && req.query.q.trim()) {
      const search = req.query.q.trim().slice(0, 80).replace(/[^a-zA-Z0-9 ]/g, "");
      if (search) filter.$or = [{ title: { $regex: search, $options: "i" } }, { summary: { $regex: search, $options: "i" } }];
    }
    const [items, total] = await Promise.all([
      Incident.find(filter).sort({ severity: 1, reportedAt: -1 }).skip((page - 1) * limit).limit(limit).populate("vendorId", "name").populate("findingId", "title severity status").populate("assignedTo", "name email").lean(),
      Incident.countDocuments(filter),
    ]);
    res.json({ data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

incidentRouter.post("/", requirePermission("security:write"), async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const links = { vendorId: input.vendorId || undefined, findingId: input.findingId || undefined, assignedTo: input.assignedTo || undefined };
    const linkError = await validateLinks(req.tenant!.organizationId, links);
    if (linkError) { res.status(400).json({ error: { code: "INVALID_INCIDENT_REFERENCE", message: linkError } }); return; }
    const incident = await Incident.create({
      organizationId: req.tenant!.organizationId, title: input.title, summary: input.summary, category: input.category,
      severity: input.severity, source: input.source, vendorId: links.vendorId || null, findingId: links.findingId || null,
      assignedTo: links.assignedTo || null, detectedAt: input.detectedAt ? new Date(input.detectedAt) : null,
      impact: input.impact ?? "", createdBy: req.auth!.userId, updatedBy: req.auth!.userId,
    });
    await appendEvent({ organizationId: req.tenant!.organizationId, incidentId: String(incident._id), actorId: req.auth!.userId, action: "created", details: { severity: incident.severity, category: incident.category } });
    if (incident.assignedTo) await appendEvent({ organizationId: req.tenant!.organizationId, incidentId: String(incident._id), actorId: req.auth!.userId, action: "assigned", details: { assignedTo: String(incident.assignedTo) } });
    res.status(201).json({ data: incident });
  } catch (error) { next(error); }
});

incidentRouter.get("/:id", requirePermission("security:read"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { notFound(res); return; }
    const incident = await Incident.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId }).populate("vendorId", "name").populate("findingId", "title severity status").populate("assignedTo", "name email").lean();
    if (!incident) { notFound(res); return; }
    const events = await IncidentEvent.find({ incidentId: incident._id, organizationId: req.tenant!.organizationId }).sort({ occurredAt: 1 }).populate("actorId", "name").lean();
    res.json({ data: { ...incident, events } });
  } catch (error) { next(error); }
});

incidentRouter.patch("/:id", requirePermission("security:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { notFound(res); return; }
    const input = updateSchema.parse(req.body);
    const incident = await Incident.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId });
    if (!incident) { notFound(res); return; }
    if (["resolved", "closed"].includes(incident.status)) { res.status(409).json({ error: { code: "INCIDENT_CLOSED", message: "Reopen the incident before editing its details." } }); return; }
    const previousAssignee = incident.assignedTo ? String(incident.assignedTo) : "";
    const linkInput = {
      assignedTo: input.assignedTo === undefined ? undefined : input.assignedTo || null,
    };
    const linkError = await validateLinks(req.tenant!.organizationId, linkInput);
    if (linkError) { res.status(400).json({ error: { code: "INVALID_INCIDENT_REFERENCE", message: linkError } }); return; }
    if (input.title !== undefined) incident.title = input.title;
    if (input.summary !== undefined) incident.summary = input.summary;
    if (input.category !== undefined) incident.category = input.category;
    if (input.severity !== undefined) incident.severity = input.severity;
    if (input.source !== undefined) incident.source = input.source;
    if (input.impact !== undefined) incident.impact = input.impact;
    if (input.rootCause !== undefined) incident.rootCause = input.rootCause;
    if (input.containmentPlan !== undefined) incident.containmentPlan = input.containmentPlan;
    if (input.recoveryPlan !== undefined) incident.recoveryPlan = input.recoveryPlan;
    if (input.lessonsLearned !== undefined) incident.lessonsLearned = input.lessonsLearned;
    if (input.assignedTo !== undefined) incident.assignedTo = input.assignedTo ? new Types.ObjectId(input.assignedTo) : null;
    if (input.detectedAt !== undefined) incident.detectedAt = input.detectedAt ? new Date(input.detectedAt) : null;
    incident.updatedBy = new Types.ObjectId(req.auth!.userId);
    await incident.save();
    const changedFields = Object.keys(input);
    await appendEvent({ organizationId: req.tenant!.organizationId, incidentId: String(incident._id), actorId: req.auth!.userId, action: input.assignedTo !== undefined && previousAssignee !== (input.assignedTo || "") ? "assigned" : "details_updated", details: { changedFields, previousAssignee, assignedTo: incident.assignedTo ? String(incident.assignedTo) : "" } });
    res.json({ data: incident });
  } catch (error) { next(error); }
});

incidentRouter.post("/:id/transition", requirePermission("security:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { notFound(res); return; }
    const input = transitionSchema.parse(req.body);
    const incident = await Incident.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId });
    if (!incident) { notFound(res); return; }
    let eventAction: "triaged" | "investigation_started" | "contained" | "recovery_started" | "resolved" | "closed" | "reopened";
    switch (input.action) {
      case "triage":
        if (incident.status !== "reported") { res.status(409).json({ error: { code: "INVALID_INCIDENT_TRANSITION", message: "Only reported incidents can be triaged." } }); return; }
        incident.status = "triaged"; eventAction = "triaged"; break;
      case "investigate":
        if (!["reported", "triaged"].includes(incident.status)) { res.status(409).json({ error: { code: "INVALID_INCIDENT_TRANSITION", message: "Only reported or triaged incidents can enter investigation." } }); return; }
        incident.status = "investigating"; incident.detectedAt ??= new Date(); eventAction = "investigation_started"; break;
      case "contain":
        if (!["investigating", "triaged"].includes(incident.status) || !incident.containmentPlan) { res.status(409).json({ error: { code: "CONTAINMENT_PLAN_REQUIRED", message: "Add a containment plan before marking the incident contained." } }); return; }
        incident.status = "contained"; incident.containedAt = new Date(); eventAction = "contained"; break;
      case "recover":
        if (incident.status !== "contained" || !incident.recoveryPlan) { res.status(409).json({ error: { code: "RECOVERY_PLAN_REQUIRED", message: "A contained incident with a recovery plan is required." } }); return; }
        incident.status = "recovering"; eventAction = "recovery_started"; break;
      case "resolve":
        if (!["contained", "recovering"].includes(incident.status)) { res.status(409).json({ error: { code: "INVALID_INCIDENT_TRANSITION", message: "Contain the incident before resolving it." } }); return; }
        incident.status = "resolved"; incident.resolvedAt = new Date(); eventAction = "resolved"; break;
      case "close":
        if (!isReviewer(req.tenant!.role)) { res.status(403).json({ error: { code: "REVIEWER_REQUIRED", message: "Only an owner or admin can close an incident." } }); return; }
        if (incident.status !== "resolved") { res.status(409).json({ error: { code: "INVALID_INCIDENT_TRANSITION", message: "Resolve the incident before closing it." } }); return; }
        incident.status = "closed"; incident.closedAt = new Date(); eventAction = "closed"; break;
      case "reopen":
        if (!isReviewer(req.tenant!.role)) { res.status(403).json({ error: { code: "REVIEWER_REQUIRED", message: "Only an owner or admin can reopen an incident." } }); return; }
        if (!["resolved", "closed"].includes(incident.status)) { res.status(409).json({ error: { code: "INVALID_INCIDENT_TRANSITION", message: "Only resolved or closed incidents can be reopened." } }); return; }
        incident.status = "investigating"; incident.resolvedAt = null; incident.closedAt = null; eventAction = "reopened"; break;
    }
    incident.updatedBy = new Types.ObjectId(req.auth!.userId);
    await incident.save();
    await appendEvent({ organizationId: req.tenant!.organizationId, incidentId: String(incident._id), actorId: req.auth!.userId, action: eventAction, details: { from: input.action === "reopen" ? "resolved_or_closed" : "previous", to: incident.status, comment: input.comment ?? "" } });
    res.json({ data: incident });
  } catch (error) { next(error); }
});

incidentRouter.post("/:id/comments", requirePermission("security:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { notFound(res); return; }
    const input = commentSchema.parse(req.body);
    const incident = await Incident.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId }).select("_id status").lean();
    if (!incident) { notFound(res); return; }
    if (incident.status === "closed") { res.status(409).json({ error: { code: "INCIDENT_CLOSED", message: "Reopen the incident before adding investigation notes." } }); return; }
    await appendEvent({ organizationId: req.tenant!.organizationId, incidentId: String(incident._id), actorId: req.auth!.userId, action: "comment_added", details: { comment: input.comment } });
    res.status(201).json({ data: { recorded: true } });
  } catch (error) { next(error); }
});
