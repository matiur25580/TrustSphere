import mongoose, { Schema, type InferSchemaType } from "mongoose";

const evidenceSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true, index: true },
  controlId: { type: String, required: true, immutable: true, index: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  fileName: { type: String, required: true, trim: true, maxlength: 180 },
  mimeType: { type: String, required: true, enum: ["application/pdf", "image/png", "image/jpeg", "text/plain"] },
  sizeBytes: { type: Number, required: true, min: 1, max: 25 * 1024 * 1024 },
  sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/i },
  storageKey: { type: String, required: true, immutable: true, maxlength: 240, match: /^[a-f0-9-]+$/ },
  status: { type: String, enum: ["pending_review", "approved", "rejected", "expired"], default: "pending_review", required: true, index: true },
  expiresAt: { type: Date, default: null, index: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  reviewComment: { type: String, maxlength: 2000, default: "" },
}, { timestamps: true });
evidenceSchema.index({ organizationId: 1, controlId: 1, createdAt: -1 });
evidenceSchema.index({ organizationId: 1, status: 1, expiresAt: 1 });
evidenceSchema.index({ organizationId: 1, storageKey: 1 }, { unique: true });

const evidenceEventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true, index: true },
  evidenceId: { type: Schema.Types.ObjectId, ref: "ComplianceEvidence", required: true, immutable: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  action: { type: String, enum: ["uploaded", "approved", "rejected", "downloaded"], required: true, immutable: true },
  details: { type: Schema.Types.Mixed, default: {}, immutable: true },
  occurredAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false, timestamps: false });
evidenceEventSchema.index({ organizationId: 1, evidenceId: 1, occurredAt: -1 });

export type ComplianceEvidenceDocument = InferSchemaType<typeof evidenceSchema> & mongoose.Document;
export const ComplianceEvidence = mongoose.models.ComplianceEvidence ?? mongoose.model("ComplianceEvidence", evidenceSchema);
export const EvidenceEvent = mongoose.models.EvidenceEvent ?? mongoose.model("EvidenceEvent", evidenceEventSchema);
