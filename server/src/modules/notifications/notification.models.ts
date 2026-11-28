import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
  recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  type: { type: String, required: true, enum: ["incident_sla_breach"] },
  dedupeKey: { type: String, required: true, unique: true, immutable: true },
  incidentId: { type: Schema.Types.ObjectId, ref: "Incident", required: true, immutable: true },
  incidentTitle: { type: String, required: true, maxlength: 180 },
  severity: { type: String, required: true, enum: ["p1", "p2", "p3", "p4"] },
  milestone: { type: String, required: true, enum: ["response", "containment", "resolution"] },
  title: { type: String, required: true, maxlength: 180 },
  message: { type: String, required: true, maxlength: 500 },
  readAt: { type: Date, default: null },
}, { timestamps: true });

notificationSchema.index({ organizationId: 1, recipientId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ organizationId: 1, incidentId: 1, createdAt: -1 });

const slaBreachSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
  incidentId: { type: Schema.Types.ObjectId, ref: "Incident", required: true, immutable: true },
  milestone: { type: String, required: true, enum: ["response", "containment", "resolution"], immutable: true },
  severity: { type: String, required: true, enum: ["p1", "p2", "p3", "p4"] },
  breachedAt: { type: Date, required: true, immutable: true },
}, { timestamps: true });

slaBreachSchema.index({ organizationId: 1, incidentId: 1, milestone: 1 }, { unique: true });
slaBreachSchema.index({ organizationId: 1, breachedAt: -1 });

export const SecurityNotification = mongoose.models.SecurityNotification ?? mongoose.model("SecurityNotification", notificationSchema);
export const IncidentSlaBreach = mongoose.models.IncidentSlaBreach ?? mongoose.model("IncidentSlaBreach", slaBreachSchema);
