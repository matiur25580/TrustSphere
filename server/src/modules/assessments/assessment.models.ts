import mongoose, { Schema, type InferSchemaType } from "mongoose";

const evidenceSchema = new Schema({
  storageKey: { type: String, required: true, maxlength: 240, match: /^[a-zA-Z0-9/_-]+$/ },
  fileName: { type: String, required: true, trim: true, maxlength: 180 },
  mimeType: { type: String, required: true, enum: ["application/pdf", "image/png", "image/jpeg", "text/plain"] },
  sizeBytes: { type: Number, required: true, min: 1, max: 25 * 1024 * 1024 },
  sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/i },
}, { _id: false });

const responseSchema = new Schema({
  questionId: { type: String, required: true },
  answer: { type: String, enum: ["yes", "partial", "no", "not_applicable"], required: true },
  comment: { type: String, maxlength: 2000, default: "" },
  evidence: { type: [evidenceSchema], default: [] },
  answeredAt: { type: Date, required: true },
  answeredBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { _id: false });

const breakdownSchema = new Schema({
  category: { type: String, required: true },
  score: { type: Number, min: 0, max: 100, required: true },
  answeredWeight: { type: Number, min: 0, required: true },
  totalWeight: { type: Number, min: 0, required: true },
}, { _id: false });

const assessmentSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  templateId: { type: String, required: true },
  templateVersion: { type: Number, required: true },
  templateSnapshot: { type: Schema.Types.Mixed, required: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  status: { type: String, enum: ["draft", "in_progress", "submitted", "approved", "rejected"], default: "draft", required: true, index: true },
  responses: { type: [responseSchema], default: [] },
  scoreModelVersion: { type: String, default: null },
  riskScore: { type: Number, min: 0, max: 100, default: null },
  riskBand: { type: String, enum: ["low", "medium", "high", "critical", null], default: null },
  categoryBreakdown: { type: [breakdownSchema], default: [] },
  submittedAt: { type: Date, default: null },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  reviewerComment: { type: String, maxlength: 2000, default: "" },
}, { timestamps: true });

assessmentSchema.index({ organizationId: 1, vendorId: 1, createdAt: -1 });
assessmentSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

const assessmentEventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true, index: true },
  assessmentId: { type: Schema.Types.ObjectId, ref: "VendorAssessment", required: true, immutable: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  action: { type: String, required: true, immutable: true, enum: ["created", "responses_saved", "submitted", "approved", "rejected"] },
  details: { type: Schema.Types.Mixed, default: {}, immutable: true },
  occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
}, { versionKey: false, timestamps: false, strict: true });
assessmentEventSchema.index({ organizationId: 1, assessmentId: 1, occurredAt: -1 });

export type VendorAssessmentDocument = InferSchemaType<typeof assessmentSchema> & mongoose.Document;
export const VendorAssessment = mongoose.models.VendorAssessment ?? mongoose.model("VendorAssessment", assessmentSchema);
export const AssessmentEvent = mongoose.models.AssessmentEvent ?? mongoose.model("AssessmentEvent", assessmentEventSchema);
