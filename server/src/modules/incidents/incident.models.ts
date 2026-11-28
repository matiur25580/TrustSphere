import mongoose, { Schema, type InferSchemaType } from "mongoose";

const incidentSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  summary: { type: String, required: true, trim: true, maxlength: 4000 },
  category: { type: String, required: true, enum: ["data_breach", "unauthorized_access", "malware", "service_disruption", "vendor_incident", "phishing", "policy_violation", "other"], index: true },
  severity: { type: String, required: true, enum: ["p1", "p2", "p3", "p4"], index: true },
  status: { type: String, required: true, enum: ["reported", "triaged", "investigating", "contained", "recovering", "resolved", "closed"], default: "reported", index: true },
  source: { type: String, required: true, enum: ["internal", "vendor", "customer", "automated", "other"], default: "internal" },
  vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", default: null, index: true },
  findingId: { type: Schema.Types.ObjectId, ref: "Finding", default: null, index: true },
  assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
  reportedAt: { type: Date, required: true, default: Date.now },
  responseDueAt: { type: Date, default: null, index: true },
  containmentDueAt: { type: Date, default: null },
  resolutionDueAt: { type: Date, default: null },
  firstRespondedAt: { type: Date, default: null },
  slaBreachedAt: { type: Date, default: null },
  detectedAt: { type: Date, default: null },
  containedAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
  impact: { type: String, trim: true, maxlength: 3000, default: "" },
  rootCause: { type: String, trim: true, maxlength: 3000, default: "" },
  containmentPlan: { type: String, trim: true, maxlength: 3000, default: "" },
  recoveryPlan: { type: String, trim: true, maxlength: 3000, default: "" },
  lessonsLearned: { type: String, trim: true, maxlength: 3000, default: "" },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

incidentSchema.index({ organizationId: 1, status: 1, severity: 1, updatedAt: -1 });
incidentSchema.index({ organizationId: 1, reportedAt: -1 });

const incidentEventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true, index: true },
  incidentId: { type: Schema.Types.ObjectId, ref: "Incident", required: true, immutable: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  action: { type: String, required: true, immutable: true, enum: ["created", "details_updated", "assigned", "triaged", "investigation_started", "contained", "recovery_started", "resolved", "closed", "reopened", "comment_added"] },
  details: { type: Schema.Types.Mixed, default: {}, immutable: true },
  occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
}, { versionKey: false, timestamps: false, strict: true });
incidentEventSchema.index({ organizationId: 1, incidentId: 1, occurredAt: 1 });

export type IncidentDocument = InferSchemaType<typeof incidentSchema> & mongoose.Document;
export const Incident = mongoose.models.Incident ?? mongoose.model("Incident", incidentSchema);
export const IncidentEvent = mongoose.models.IncidentEvent ?? mongoose.model("IncidentEvent", incidentEventSchema);
