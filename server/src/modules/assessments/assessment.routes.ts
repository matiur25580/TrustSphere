import { Router } from "express";
import { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import { authenticate, requirePermission, requireTenant } from "../identity/identity.middleware.js";
import { Vendor } from "../vendors/vendor.models.js";
import { AssessmentEvent, VendorAssessment } from "./assessment.models.js";
import { scoreResponses } from "./assessment.scoring.js";

export const assessmentRouter = Router();
assessmentRouter.use(authenticate, requireTenant);

const SCORE_MODEL_VERSION = "vendor-security-risk-v1";
const template = {
  id: "trustsphere-vendor-security-baseline",
  version: 1,
  title: "Vendor Security Baseline",
  description: "A practical baseline covering governance, identity, data protection and resilience.",
  questions: [
    { id: "gov-01", category: "Governance", prompt: "Is an information security policy approved and reviewed at least annually?", weight: 3, required: true },
    { id: "gov-02", category: "Governance", prompt: "Are security responsibilities and escalation paths formally assigned?", weight: 2, required: true },
    { id: "iam-01", category: "Identity & access", prompt: "Is multi-factor authentication enforced for privileged and remote access?", weight: 4, required: true },
    { id: "iam-02", category: "Identity & access", prompt: "Are user access rights reviewed periodically and revoked promptly?", weight: 3, required: true },
    { id: "data-01", category: "Data protection", prompt: "Is sensitive data encrypted in transit and at rest?", weight: 4, required: true },
    { id: "data-02", category: "Data protection", prompt: "Are data retention, deletion and backup practices documented?", weight: 2, required: true },
    { id: "res-01", category: "Resilience", prompt: "Are backups tested and protected against unauthorized modification?", weight: 3, required: true },
    { id: "res-02", category: "Resilience", prompt: "Is there a tested incident response and business continuity process?", weight: 3, required: true },
  ],
};

const createSchema = z.object({
  vendorId: z.string().refine(isValidObjectId, "Invalid vendor identifier"),
  title: z.string().trim().min(3).max(180).optional(),
}).strict();
const evidenceSchema = z.object({
  storageKey: z.string().regex(/^[a-zA-Z0-9/_-]+$/).max(240).refine(value => !value.includes("..") && !value.startsWith("/"), "Evidence key must be an opaque relative storage key"),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "text/plain"]),
  sizeBytes: z.number().int().min(1).max(25 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
});
const responseSchema = z.object({
  questionId: z.string().min(1).max(40),
  answer: z.enum(["yes", "partial", "no", "not_applicable"]),
  comment: z.string().max(2000).optional(),
  evidence: z.array(evidenceSchema).max(5).optional(),
});
const saveSchema = z.object({ responses: z.array(responseSchema).max(50) }).strict();
const reviewSchema = z.object({ decision: z.enum(["approved", "rejected"]), comment: z.string().trim().max(2000).optional() }).strict();

function isReviewer(role: string) {
  return role === "owner" || role === "admin";
}
async function appendEvent(input: { organizationId: string; assessmentId: string; actorId: string; action: "created" | "responses_saved" | "submitted" | "approved" | "rejected"; details?: Record<string, unknown> }) {
  await AssessmentEvent.create(input);
}

assessmentRouter.get("/templates", requirePermission("risk:read"), (_req, res) => {
  res.json({ data: [template] });
});

assessmentRouter.get("/summary", requirePermission("risk:read"), async (req, res, next) => {
  try {
    const organizationId = new Types.ObjectId(req.tenant!.organizationId);
    const [rows, latest] = await Promise.all([
      VendorAssessment.aggregate([
        { $match: { organizationId } },
        { $group: { _id: null, total: { $sum: 1 }, inProgress: { $sum: { $cond: [{ $in: ["$status", ["draft", "in_progress"]] }, 1, 0] } }, awaitingReview: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } }, approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } }, averageRisk: { $avg: "$riskScore" } } },
      ]),
      VendorAssessment.find({ organizationId, riskScore: { $ne: null } }).sort({ createdAt: -1 }).limit(5).select("title riskScore riskBand status vendorId").populate("vendorId", "name").lean(),
    ]);
    res.json({ data: { ...(rows[0] ?? { total: 0, inProgress: 0, awaitingReview: 0, approved: 0, averageRisk: null }), recent: latest } });
  } catch (error) { next(error); }
});

assessmentRouter.get("/", requirePermission("risk:read"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit ?? "10"), 10) || 10));
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const vendorId = typeof req.query.vendorId === "string" && isValidObjectId(req.query.vendorId) ? req.query.vendorId : "";
    const filter: Record<string, unknown> = { organizationId: req.tenant!.organizationId };
    if (["draft", "in_progress", "submitted", "approved", "rejected"].includes(status)) filter.status = status;
    if (vendorId) filter.vendorId = vendorId;
    const [items, total] = await Promise.all([
      VendorAssessment.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).populate("vendorId", "name category").lean(),
      VendorAssessment.countDocuments(filter),
    ]);
    res.json({ data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

assessmentRouter.post("/", requirePermission("risk:write"), async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const vendor = await Vendor.findOne({ _id: input.vendorId, organizationId: req.tenant!.organizationId, archivedAt: null }).select("_id name").lean();
    if (!vendor) { res.status(404).json({ error: { code: "VENDOR_NOT_FOUND", message: "Vendor not found in this organization." } }); return; }
    const assessment = await VendorAssessment.create({
      organizationId: req.tenant!.organizationId, vendorId: vendor._id, createdBy: req.auth!.userId,
      templateId: template.id, templateVersion: template.version, templateSnapshot: template,
      title: input.title ?? `${vendor.name} — ${template.title}`, status: "draft",
    });
    await appendEvent({ organizationId: req.tenant!.organizationId, assessmentId: String(assessment._id), actorId: req.auth!.userId, action: "created", details: { vendorId: String(vendor._id), templateId: template.id, templateVersion: template.version } });
    res.status(201).json({ data: assessment });
  } catch (error) { next(error); }
});

assessmentRouter.get("/:id", requirePermission("risk:read"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { res.status(404).json({ error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found." } }); return; }
    const assessment = await VendorAssessment.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId }).populate("vendorId", "name category").lean();
    if (!assessment) { res.status(404).json({ error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found." } }); return; }
    const events = await AssessmentEvent.find({ assessmentId: assessment._id, organizationId: req.tenant!.organizationId }).sort({ occurredAt: 1 }).lean();
    res.json({ data: { ...assessment, events } });
  } catch (error) { next(error); }
});

assessmentRouter.put("/:id/responses", requirePermission("risk:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { res.status(404).json({ error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found." } }); return; }
    const input = saveSchema.parse(req.body);
    const evidencePrefix = `${req.tenant!.organizationId}/`;
    if (input.responses.some(response => response.evidence?.some(item => !item.storageKey.startsWith(evidencePrefix)))) {
      res.status(400).json({ error: { code: "INVALID_EVIDENCE_SCOPE", message: "Evidence storage keys must be namespaced to the active organization." } });
      return;
    }
    const assessment = await VendorAssessment.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId });
    if (!assessment) { res.status(404).json({ error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found." } }); return; }
    if (!["draft", "in_progress"].includes(assessment.status)) { res.status(409).json({ error: { code: "ASSESSMENT_LOCKED", message: "Submitted assessments cannot be edited." } }); return; }
    const questionIds = new Set((assessment.templateSnapshot as typeof template).questions.map(question => question.id));
    if (input.responses.some(response => !questionIds.has(response.questionId))) { res.status(400).json({ error: { code: "UNKNOWN_QUESTION", message: "A response references a question outside this template version." } }); return; }
    const responseMap = new Map(assessment.responses.map(response => [response.questionId, response.toObject()]));
    for (const response of input.responses) responseMap.set(response.questionId, { ...response, answeredAt: new Date(), answeredBy: new Types.ObjectId(req.auth!.userId) });
    assessment.responses = [...responseMap.values()] as typeof assessment.responses;
    assessment.status = "in_progress";
    await assessment.save();
    await appendEvent({ organizationId: req.tenant!.organizationId, assessmentId: String(assessment._id), actorId: req.auth!.userId, action: "responses_saved", details: { responseCount: input.responses.length } });
    res.json({ data: assessment });
  } catch (error) { next(error); }
});

assessmentRouter.post("/:id/submit", requirePermission("risk:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { res.status(404).json({ error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found." } }); return; }
    const assessment = await VendorAssessment.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId });
    if (!assessment) { res.status(404).json({ error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found." } }); return; }
    if (!["draft", "in_progress"].includes(assessment.status)) { res.status(409).json({ error: { code: "ASSESSMENT_LOCKED", message: "This assessment has already been submitted." } }); return; }
    const snapshot = assessment.templateSnapshot as typeof template;
    const responseMap = new Map(assessment.responses.map(response => [response.questionId, response.answer]));
    const missing = snapshot.questions.filter(question => question.required && !responseMap.has(question.id));
    if (missing.length) { res.status(400).json({ error: { code: "REQUIRED_RESPONSES_MISSING", message: "Complete every required question before submitting.", details: { missingQuestionIds: missing.map(question => question.id) } } }); return; }
    const scoreableResponses = assessment.responses.filter(response => response.answer !== "not_applicable");
    if (scoreableResponses.length === 0) { res.status(400).json({ error: { code: "NO_SCORABLE_RESPONSES", message: "At least one question must have a scored answer; an all-not-applicable assessment cannot produce a risk rating." } }); return; }
    const scored = scoreResponses(scoreableResponses.map(response => ({ questionId: response.questionId, answer: response.answer })), snapshot.questions);
    assessment.scoreModelVersion = SCORE_MODEL_VERSION;
    assessment.riskScore = scored.score;
    assessment.riskBand = scored.band;
    assessment.categoryBreakdown = scored.breakdown;
    assessment.status = "submitted";
    assessment.submittedAt = new Date();
    await assessment.save();
    await appendEvent({ organizationId: req.tenant!.organizationId, assessmentId: String(assessment._id), actorId: req.auth!.userId, action: "submitted", details: { scoreModelVersion: SCORE_MODEL_VERSION, riskScore: scored.score, riskBand: scored.band } });
    res.json({ data: assessment });
  } catch (error) { next(error); }
});

assessmentRouter.post("/:id/review", requirePermission("risk:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { res.status(404).json({ error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found." } }); return; }
    if (!isReviewer(req.tenant!.role)) { res.status(403).json({ error: { code: "REVIEWER_REQUIRED", message: "Only organization owners and admins can approve or reject assessments." } }); return; }
    const input = reviewSchema.parse(req.body);
    const assessment = await VendorAssessment.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId });
    if (!assessment) { res.status(404).json({ error: { code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found." } }); return; }
    if (assessment.status !== "submitted") { res.status(409).json({ error: { code: "ASSESSMENT_NOT_SUBMITTED", message: "Only submitted assessments can be reviewed." } }); return; }
    assessment.status = input.decision;
    assessment.reviewedAt = new Date();
    assessment.reviewedBy = new Types.ObjectId(req.auth!.userId);
    assessment.reviewerComment = input.comment ?? "";
    await assessment.save();
    await appendEvent({ organizationId: req.tenant!.organizationId, assessmentId: String(assessment._id), actorId: req.auth!.userId, action: input.decision, details: { comment: input.comment ?? "" } });
    res.json({ data: assessment });
  } catch (error) { next(error); }
});
