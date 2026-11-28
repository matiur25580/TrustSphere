import mongoose, { Schema, type InferSchemaType } from "mongoose";

const securityAlertSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
  source: { type: String, required: true, enum: ["siem", "edr", "cloud", "email_gateway", "manual", "other"] },
  sourceEventId: { type: String, required: true, trim: true, maxlength: 180 },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, required: true, trim: true, maxlength: 4000 },
  category: { type: String, required: true, enum: ["data_breach", "unauthorized_access", "malware", "service_disruption", "vendor_incident", "phishing", "policy_violation", "other"] },
  severity: { type: String, required: true, enum: ["p1", "p2", "p3", "p4"] },
  occurrenceCount: { type: Number, required: true, default: 1, min: 1 },
  firstReceivedAt: { type: Date, required: true, default: Date.now },
  lastReceivedAt: { type: Date, required: true, default: Date.now },
  incidentId: { type: Schema.Types.ObjectId, ref: "Incident", default: null },
  receivedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
}, { timestamps: true });

securityAlertSchema.index({ organizationId: 1, source: 1, sourceEventId: 1 }, { unique: true });
securityAlertSchema.index({ organizationId: 1, severity: 1, lastReceivedAt: -1 });
securityAlertSchema.index({ organizationId: 1, incidentId: 1 });

export type SecurityAlertDocument = InferSchemaType<typeof securityAlertSchema> & mongoose.Document;
export const SecurityAlert = mongoose.models.SecurityAlert ?? mongoose.model("SecurityAlert", securityAlertSchema);
