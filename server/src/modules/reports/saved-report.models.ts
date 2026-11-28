import mongoose, { Schema, type InferSchemaType } from "mongoose";

const savedReportSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: "" },
  range: { type: String, enum: ["7d", "30d", "90d"], required: true, default: "30d" },
  format: { type: String, enum: ["csv", "pdf"], required: true, default: "csv" },
  recipients: { type: [{ type: String, trim: true, lowercase: true, maxlength: 254 }], default: [] },
  schedule: {
    frequency: { type: String, enum: ["manual", "weekly", "monthly"], required: true, default: "manual" },
    dayOfWeek: { type: Number, min: 0, max: 6, default: null },
    dayOfMonth: { type: Number, min: 1, max: 28, default: null },
    localTime: { type: String, match: /^(?:[01]\\d|2[0-3]):[0-5]\\d$/, default: "09:00" },
    timeZone: { type: String, required: true, default: "UTC", maxlength: 80 },
  },
  enabled: { type: Boolean, default: true, required: true },
  archivedAt: { type: Date, default: null },
}, { timestamps: true });

savedReportSchema.index({ organizationId: 1, archivedAt: 1, updatedAt: -1 });
savedReportSchema.index({ organizationId: 1, name: 1 }, { unique: true, partialFilterExpression: { archivedAt: null } });

export type SavedReportDocument = InferSchemaType<typeof savedReportSchema> & mongoose.Document;
export const SavedReport = mongoose.models.SavedReport ?? mongoose.model("SavedReport", savedReportSchema);
