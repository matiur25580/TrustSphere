import { Router } from "express";
import { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import { authenticate, requirePermission, requireTenant } from "../identity/identity.middleware.js";
import { VendorAssessment } from "../assessments/assessment.models.js";
import { Finding, FindingEvent } from "./finding.models.js";
import { classifyFinding } from "./finding.scoring.js";

export const findingRouter = Router();
findingRouter.use(authenticate, requireTenant);

const createSchema = z.object({
  assessmentId: z.string().refine(isValidObjectId, "Invalid assessment identifier"),
  questionId: z.string().trim().min(1).max(40),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(5).max(3000),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  priority: z.enum(["p1", "p2", "p3", "p4"]).optional(),
}).strict();

const updateSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().min(5).max(3000).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  priority: z.enum(["p1", "p2", "p3", "p4"]).optional(),
  remediationPlan: z.string().trim().max(3000).optional(),
  remediationOwner: z.string().trim().max(120).optional(),
  dueDate: z.string().datetime().nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, "Provide at least one field to update");

const transitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).strict(),
  z.object({ action: z.literal("submit_for_validation"), resolutionNote: z.string().trim().min(5).max(2000) }).strict(),
  z.object({ action: z.literal("validate"), decision: z.enum(["resolved", "reopen"]), comment: z.string().trim().max(2000).optional() }).strict(),
  z.object({ action: z.literal("accept_risk"), reason: z.string().trim().min(10).max(2000) }).strict(),
]);

function reviewer(role: string) { return role === "owner" || role === "admin"; }
async function event(input: { organizationId: string; findingId: string; actorId: string; action: "created" | "remediation_updated" | "status_changed" | "submitted_for_validation" | "validated" | "accepted"; details?: Record<string, unknown> }) {
  await FindingEvent.create(input);
}
function notFound(res: import("express").Response) {
  res.status(404).json({ error: { code: "FINDING_NOT_FOUND", message: "Finding not found in this organization." } });
}

findingRouter.get("/summary", requirePermission("risk:read"), async (req, res, next) => {
  try {
    const organizationId = new Types.ObjectId(req.tenant!.organizationId);
    const rows = await Finding.aggregate([
      { $match: { organizationId } },
      { $group: { _id: null, total: { $sum: 1 }, open: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } }, inProgress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } }, pendingValidation: { $sum: { $cond: [{ $eq: ["$status", "pending_validation"] }, 1, 0] } }, overdue: { $sum: { $cond: [{ $and: [{ $ne: ["$dueDate", null] }, { $lt: ["$dueDate", new Date()] }, { $not: [{ $in: ["$status", ["resolved", "accepted"]] }] }] }, 1, 0] } }, critical: { $sum: { $cond: [{ $eq: ["$severity", "critical"] }, 1, 0] } } } },
    ]);
    res.json({ data: rows[0] ?? { total: 0, open: 0, inProgress: 0, pendingValidation: 0, overdue: 0, critical: 0 } });
  } catch (error) { next(error); }
});

findingRouter.get("/", requirePermission("risk:read"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit ?? "10"), 10) || 10));
    const filter: Record<string, unknown> = { organizationId: req.tenant!.organizationId };
    if (typeof req.query.status === "string" && ["open", "in_progress", "pending_validation", "resolved", "accepted"].includes(req.query.status)) filter.status = req.query.status;
    if (typeof req.query.severity === "string" && ["low", "medium", "high", "critical"].includes(req.query.severity)) filter.severity = req.query.severity;
    if (typeof req.query.priority === "string" && ["p1", "p2", "p3", "p4"].includes(req.query.priority)) filter.priority = req.query.priority;
    if (typeof req.query.vendorId === "string" && isValidObjectId(req.query.vendorId)) filter.vendorId = req.query.vendorId;
    if (typeof req.query.assessmentId === "string" && isValidObjectId(req.query.assessmentId)) filter.assessmentId = req.query.assessmentId;
    const [items, total] = await Promise.all([
      Finding.find(filter).sort({ priority: 1, updatedAt: -1 }).skip((page - 1) * limit).limit(limit).populate("vendorId", "name").populate("assessmentId", "title status").lean(),
      Finding.countDocuments(filter),
    ]);
    res.json({ data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

findingRouter.post("/from-assessment/:assessmentId", requirePermission("risk:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.assessmentId)) { res.status(404).json({ error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found." } }); return; }
    const assessment = await VendorAssessment.findOne({ _id: req.params.assessmentId, organizationId: req.tenant!.organizationId }).populate("vendorId", "name").lean();
    if (!assessment) { res.status(404).json({ error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found in this organization." } }); return; }
    if (!["submitted", "approved", "rejected"].includes(assessment.status)) { res.status(409).json({ error: { code: "ASSESSMENT_NOT_SUBMITTED", message: "Submit the assessment before generating findings." } }); return; }
    const snapshot = assessment.templateSnapshot as { questions: Array<{ id: string; category: string; prompt: string; weight: number }> };
    const questionMap = new Map(snapshot.questions.map(question => [question.id, question]));
    const created = [];
    for (const response of assessment.responses) {
      if (response.answer !== "no" && response.answer !== "partial") continue;
      const question = questionMap.get(response.questionId);
      if (!question) continue;
      const classification = classifyFinding({ answer: response.answer, weight: question.weight });
      const result = await Finding.updateOne(
        { organizationId: req.tenant!.organizationId, assessmentId: assessment._id, questionId: response.questionId },
        { $setOnInsert: {
          organizationId: req.tenant!.organizationId, vendorId: assessment.vendorId, assessmentId: assessment._id,
          questionId: response.questionId, title: question.prompt, description: response.comment || `The vendor answered "${response.answer}" to this security control.`,
          category: question.category, severity: classification.severity, priority: classification.priority, sourceAnswer: response.answer,
          createdBy: req.auth!.userId, updatedBy: req.auth!.userId, status: "open",
        } },
        { upsert: true },
      );
      if (result.upsertedCount) {
        const finding = await Finding.findOne({ organizationId: req.tenant!.organizationId, assessmentId: assessment._id, questionId: response.questionId }).lean();
        if (finding) {
          created.push(finding);
          await event({ organizationId: req.tenant!.organizationId, findingId: String(finding._id), actorId: req.auth!.userId, action: "created", details: { source: "assessment", questionId: response.questionId, severity: classification.severity } });
        }
      }
    }
    res.status(201).json({ data: { createdCount: created.length, findings: created } });
  } catch (error) { next(error); }
});

findingRouter.post("/", requirePermission("risk:write"), async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const assessment = await VendorAssessment.findOne({ _id: input.assessmentId, organizationId: req.tenant!.organizationId }).lean();
    if (!assessment) { res.status(404).json({ error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found in this organization." } }); return; }
    const question = (assessment.templateSnapshot as { questions: Array<{ id: string; category: string; weight: number }> }).questions.find(item => item.id === input.questionId);
    if (!question) { res.status(400).json({ error: { code: "UNKNOWN_QUESTION", message: "Question does not belong to this assessment template." } }); return; }
    const response = assessment.responses.find(item => item.questionId === input.questionId);
    if (!response || !["no", "partial"].includes(response.answer)) { res.status(400).json({ error: { code: "NO_CONTROL_GAP", message: "A finding can only be linked to a response of No or Partial." } }); return; }
    const classification = classifyFinding({ answer: response.answer as "no" | "partial", weight: question.weight });
    const finding = await Finding.create({
      organizationId: req.tenant!.organizationId, vendorId: assessment.vendorId, assessmentId: assessment._id,
      questionId: input.questionId, title: input.title, description: input.description, category: question.category,
      severity: input.severity ?? classification.severity, priority: input.priority ?? classification.priority,
      sourceAnswer: response.answer, createdBy: req.auth!.userId, updatedBy: req.auth!.userId,
    });
    await event({ organizationId: req.tenant!.organizationId, findingId: String(finding._id), actorId: req.auth!.userId, action: "created", details: { source: "manual", assessmentId: String(assessment._id) } });
    res.status(201).json({ data: finding });
  } catch (error) { next(error); }
});

findingRouter.get("/:id", requirePermission("risk:read"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { notFound(res); return; }
    const finding = await Finding.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId }).populate("vendorId", "name").populate("assessmentId", "title status").lean();
    if (!finding) { notFound(res); return; }
    const events = await FindingEvent.find({ findingId: finding._id, organizationId: req.tenant!.organizationId }).sort({ occurredAt: 1 }).lean();
    res.json({ data: { ...finding, events } });
  } catch (error) { next(error); }
});

findingRouter.patch("/:id", requirePermission("risk:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { notFound(res); return; }
    const input = updateSchema.parse(req.body);
    const finding = await Finding.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId });
    if (!finding) { notFound(res); return; }
    if (["resolved", "accepted"].includes(finding.status)) { res.status(409).json({ error: { code: "FINDING_CLOSED", message: "Reopen the finding through a reviewed workflow before editing remediation." } }); return; }
    const before = { remediationPlan: finding.remediationPlan, remediationOwner: finding.remediationOwner, dueDate: finding.dueDate, severity: finding.severity, priority: finding.priority };
    if (input.dueDate !== undefined) finding.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (input.title !== undefined) finding.title = input.title;
    if (input.description !== undefined) finding.description = input.description;
    if (input.severity !== undefined) finding.severity = input.severity;
    if (input.priority !== undefined) finding.priority = input.priority;
    if (input.remediationPlan !== undefined) finding.remediationPlan = input.remediationPlan;
    if (input.remediationOwner !== undefined) finding.remediationOwner = input.remediationOwner;
    finding.updatedBy = new Types.ObjectId(req.auth!.userId);
    await finding.save();
    await event({ organizationId: req.tenant!.organizationId, findingId: String(finding._id), actorId: req.auth!.userId, action: "remediation_updated", details: { before, changedFields: Object.keys(input) } });
    res.json({ data: finding });
  } catch (error) { next(error); }
});

findingRouter.post("/:id/transition", requirePermission("risk:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { notFound(res); return; }
    const input = transitionSchema.parse(req.body);
    const finding = await Finding.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId });
    if (!finding) { notFound(res); return; }
    let action: "status_changed" | "submitted_for_validation" | "validated" | "accepted" = "status_changed";
    if (input.action === "start") {
      if (!["open", "in_progress"].includes(finding.status)) { res.status(409).json({ error: { code: "INVALID_FINDING_TRANSITION", message: "Only open findings can be started." } }); return; }
      finding.status = "in_progress";
    } else if (input.action === "submit_for_validation") {
      if (!["open", "in_progress"].includes(finding.status)) { res.status(409).json({ error: { code: "INVALID_FINDING_TRANSITION", message: "Only active findings can be submitted for validation." } }); return; }
      if (!finding.remediationPlan || !finding.remediationOwner || !finding.dueDate) { res.status(400).json({ error: { code: "REMEDIATION_INCOMPLETE", message: "Add a remediation plan, owner and due date before validation." } }); return; }
      finding.status = "pending_validation"; finding.resolutionNote = input.resolutionNote; action = "submitted_for_validation";
    } else if (input.action === "validate") {
      if (!reviewer(req.tenant!.role)) { res.status(403).json({ error: { code: "REVIEWER_REQUIRED", message: "Only owners and admins can validate remediation." } }); return; }
      if (finding.status !== "pending_validation") { res.status(409).json({ error: { code: "INVALID_FINDING_TRANSITION", message: "Only findings pending validation can be reviewed." } }); return; }
      if (String(finding.createdBy) === req.auth!.userId) { res.status(403).json({ error: { code: "INDEPENDENT_REVIEW_REQUIRED", message: "The finding creator cannot validate their own remediation." } }); return; }
      finding.validatedBy = new Types.ObjectId(req.auth!.userId); finding.validatedAt = new Date();
      if (input.decision === "resolved") { finding.status = "resolved"; finding.resolvedAt = new Date(); }
      else { finding.status = "in_progress"; finding.validatedBy = null; finding.validatedAt = null; }
      finding.resolutionNote = input.comment ?? finding.resolutionNote; action = "validated";
    } else {
      if (!reviewer(req.tenant!.role)) { res.status(403).json({ error: { code: "REVIEWER_REQUIRED", message: "Only owners and admins can accept residual risk." } }); return; }
      if (["resolved", "accepted"].includes(finding.status)) { res.status(409).json({ error: { code: "FINDING_CLOSED", message: "This finding is already closed." } }); return; }
      finding.status = "accepted"; finding.acceptedReason = input.reason; finding.validatedBy = new Types.ObjectId(req.auth!.userId); finding.validatedAt = new Date(); action = "accepted";
    }
    finding.updatedBy = new Types.ObjectId(req.auth!.userId);
    await finding.save();
    await event({ organizationId: req.tenant!.organizationId, findingId: String(finding._id), actorId: req.auth!.userId, action, details: { transition: input.action, status: finding.status } });
    res.json({ data: finding });
  } catch (error) { next(error); }
});
