import mongoose, { Schema, type InferSchemaType } from "mongoose";

const findingSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true, immutable: true },
  vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true, immutable: true },
  assessmentId: { type: Schema.Types.ObjectId, ref: "VendorAssessment", required: true, index: true, immutable: true },
  questionId: { type: String, required: true, trim: true, maxlength: 40, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, required: true, trim: true, maxlength: 3000 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  severity: { type: String, enum: ["low", "medium", "high", "critical"], required: true, index: true },
  priority: { type: String, enum: ["p1", "p2", "p3", "p4"], required: true, index: true },
  status: { type: String, enum: ["open", "in_progress", "pending_validation", "resolved", "accepted"], default: "open", required: true, index: true },
  sourceAnswer: { type: String, enum: ["no", "partial"], required: true, immutable: true },
  remediationPlan: { type: String, trim: true, maxlength: 3000, default: "" },
  remediationOwner: { type: String, trim: true, maxlength: 120, default: "" },
  dueDate: { type: Date, default: null },
  resolutionNote: { type: String, trim: true, maxlength: 2000, default: "" },
  acceptedReason: { type: String, trim: true, maxlength: 2000, default: "" },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  resolvedAt: { type: Date, default: null },
  validatedAt: { type: Date, default: null },
  validatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

findingSchema.index({ organizationId: 1, assessmentId: 1, questionId: 1 }, { unique: true });
findingSchema.index({ organizationId: 1, status: 1, priority: 1, updatedAt: -1 });
findingSchema.index({ organizationId: 1, vendorId: 1, createdAt: -1 });

const findingEventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true, index: true },
  findingId: { type: Schema.Types.ObjectId, ref: "Finding", required: true, immutable: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  action: { type: String, required: true, immutable: true, enum: ["created", "remediation_updated", "status_changed", "submitted_for_validation", "validated", "accepted"] },
  details: { type: Schema.Types.Mixed, default: {}, immutable: true },
  occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
}, { versionKey: false, timestamps: false, strict: true });

findingEventSchema.index({ organizationId: 1, findingId: 1, occurredAt: 1 });

export type FindingDocument = InferSchemaType<typeof findingSchema> & mongoose.Document;
export const Finding = mongoose.models.Finding ?? mongoose.model("Finding", findingSchema);
export const FindingEvent = mongoose.models.FindingEvent ?? mongoose.model("FindingEvent", findingEventSchema);
