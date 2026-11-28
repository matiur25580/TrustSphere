import mongoose, { Schema } from "mongoose";

const custodyEventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
  incidentId: { type: Schema.Types.ObjectId, ref: "Incident", required: true, immutable: true },
  evidenceId: { type: Schema.Types.ObjectId, ref: "ComplianceEvidence", required: true, immutable: true },
  sequence: { type: Number, required: true, immutable: true, min: 1 },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  action: { type: String, enum: ["collected", "transferred", "accessed", "sealed", "unsealed", "exported"], required: true, immutable: true },
  fromCustodian: { type: String, trim: true, maxlength: 180, default: "" },
  toCustodian: { type: String, trim: true, maxlength: 180, default: "" },
  location: { type: String, trim: true, maxlength: 240, default: "" },
  notes: { type: String, trim: true, maxlength: 2000, default: "" },
  evidenceSha256: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  previousHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  eventHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  occurredAt: { type: Date, required: true, immutable: true },
}, { versionKey: false, timestamps: false, strict: true });
custodyEventSchema.index({ organizationId: 1, incidentId: 1, sequence: 1 }, { unique: true });
custodyEventSchema.index({ organizationId: 1, evidenceId: 1, occurredAt: -1 });

const playbookStepSchema = new Schema({
  stepId: { type: String, required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  instruction: { type: String, required: true, trim: true, maxlength: 1000 },
  actionType: { type: String, enum: ["manual_review", "notify_stakeholders", "preserve_evidence", "isolate_system", "rotate_credentials", "restore_service"], required: true },
  required: { type: Boolean, default: true },
}, { _id: false });

const playbookSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 1000, default: "" },
  category: { type: String, enum: ["data_breach", "unauthorized_access", "malware", "service_disruption", "vendor_incident", "phishing", "policy_violation", "other"], required: true },
  severity: { type: String, enum: ["any", "p1", "p2", "p3", "p4"], default: "any" },
  active: { type: Boolean, default: true },
  steps: { type: [playbookStepSchema], required: true, validate: (v: unknown[]) => v.length > 0 && v.length <= 30 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
playbookSchema.index({ organizationId: 1, name: 1 }, { unique: true });
playbookSchema.index({ organizationId: 1, category: 1, active: 1 });

const runStepSchema = new Schema({
  stepId: { type: String, required: true },
  title: { type: String, required: true },
  instruction: { type: String, required: true },
  actionType: { type: String, required: true },
  required: { type: Boolean, required: true },
  status: { type: String, enum: ["pending", "in_progress", "completed", "skipped"], default: "pending" },
  notes: { type: String, maxlength: 2000, default: "" },
  completedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  completedAt: { type: Date, default: null },
}, { _id: false });

const playbookRunSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
  incidentId: { type: Schema.Types.ObjectId, ref: "Incident", required: true, immutable: true },
  playbookId: { type: Schema.Types.ObjectId, ref: "ResponsePlaybook", required: true, immutable: true },
  playbookName: { type: String, required: true, immutable: true },
  status: { type: String, enum: ["in_progress", "completed", "cancelled"], default: "in_progress" },
  steps: { type: [runStepSchema], required: true },
  startedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  completedAt: { type: Date, default: null },
}, { timestamps: true });
playbookRunSchema.index({ organizationId: 1, incidentId: 1, createdAt: -1 });
playbookRunSchema.index({ organizationId: 1, status: 1, updatedAt: -1 });

const playbookEventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
  incidentId: { type: Schema.Types.ObjectId, ref: "Incident", required: true, immutable: true },
  runId: { type: Schema.Types.ObjectId, ref: "ResponsePlaybookRun", required: true, immutable: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  action: { type: String, enum: ["started", "step_updated", "completed", "cancelled"], required: true, immutable: true },
  details: { type: Schema.Types.Mixed, default: {}, immutable: true },
  occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
}, { versionKey: false, timestamps: false });
playbookEventSchema.index({ organizationId: 1, incidentId: 1, occurredAt: -1 });

export const IncidentCustodyEvent = mongoose.models.IncidentCustodyEvent ?? mongoose.model("IncidentCustodyEvent", custodyEventSchema);
export const ResponsePlaybook = mongoose.models.ResponsePlaybook ?? mongoose.model("ResponsePlaybook", playbookSchema);
export const ResponsePlaybookRun = mongoose.models.ResponsePlaybookRun ?? mongoose.model("ResponsePlaybookRun", playbookRunSchema);
export const ResponsePlaybookEvent = mongoose.models.ResponsePlaybookEvent ?? mongoose.model("ResponsePlaybookEvent", playbookEventSchema);
