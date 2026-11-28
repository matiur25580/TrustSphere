import mongoose, { Schema, type InferSchemaType } from "mongoose";

const savedReportDeliverySchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true, index: true },
  savedReportId: { type: Schema.Types.ObjectId, ref: "SavedReport", required: true, immutable: true, index: true },
  savedReportName: { type: String, required: true, immutable: true, maxlength: 100 },
  idempotencyKey: { type: String, required: true, immutable: true, unique: true, maxlength: 300 },
  status: { type: String, required: true, enum: ["processing", "sent", "failed"], default: "processing", index: true },
  format: { type: String, required: true, enum: ["csv", "pdf"], immutable: true },
  range: { type: String, required: true, enum: ["7d", "30d", "90d"], immutable: true },
  recipients: { type: [{ type: String, trim: true, lowercase: true }], required: true, immutable: true },
  attempts: { type: Number, required: true, default: 0 },
  providerMessageId: { type: String, default: null },
  failureReason: { type: String, default: null, maxlength: 1000 },
  scheduledFor: { type: Date, required: true, immutable: true },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

savedReportDeliverySchema.index({ organizationId: 1, savedReportId: 1, createdAt: -1 });
savedReportDeliverySchema.index({ organizationId: 1, status: 1, createdAt: -1 });

export type SavedReportDeliveryDocument = InferSchemaType<typeof savedReportDeliverySchema> & mongoose.Document;
export const SavedReportDelivery = mongoose.models.SavedReportDelivery ?? mongoose.model("SavedReportDelivery", savedReportDeliverySchema);
