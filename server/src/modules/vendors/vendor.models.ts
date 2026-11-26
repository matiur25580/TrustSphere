import mongoose, { Schema, type InferSchemaType } from "mongoose";

const vendorSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  normalizedName: { type: String, required: true, lowercase: true, trim: true },
  website: { type: String, trim: true, maxlength: 300, default: "" },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  contactName: { type: String, trim: true, maxlength: 120, default: "" },
  contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
  criticality: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium", required: true },
  dataSensitivity: { type: String, enum: ["public", "internal", "confidential", "restricted"], default: "internal", required: true },
  accessLevel: { type: String, enum: ["none", "limited", "privileged"], default: "limited", required: true },
  status: { type: String, enum: ["onboarding", "active", "under_review", "suspended", "offboarded"], default: "onboarding", required: true },
  riskScore: { type: Number, min: 0, max: 100, required: true },
  riskBand: { type: String, enum: ["low", "medium", "high", "critical"], required: true },
  archivedAt: { type: Date, default: null },
}, { timestamps: true });

vendorSchema.index({ organizationId: 1, normalizedName: 1 }, { unique: true });
vendorSchema.index({ organizationId: 1, createdAt: -1 });
vendorSchema.index({ organizationId: 1, status: 1, riskScore: -1 });
vendorSchema.index({ organizationId: 1, riskBand: 1 });

export type VendorDocument = InferSchemaType<typeof vendorSchema> & mongoose.Document;
export const Vendor = mongoose.models.Vendor ?? mongoose.model("Vendor", vendorSchema);
