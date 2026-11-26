import mongoose, { Schema, type InferSchemaType } from "mongoose";

const evidenceSchema = new Schema({
  fileName: { type: String, required: true, trim: true, maxlength: 180 },
  mimeType: { type: String, required: true, enum: ["application/pdf", "image/png", "image/jpeg", "text/plain"] },
  sizeBytes: { type: Number, required: true, min: 1, max: 25 * 1024 * 1024 },
  sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/i },
  storageKey: { type: String, required: true, maxlength: 240, match: /^[a-zA-Z0-9/_-]+$/ },
  addedAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

const implementationSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true, index: true },
  controlId: { type: String, required: true, immutable: true, trim: true, maxlength: 80 },
  status: { type: String, enum: ["not_started", "in_progress", "implemented", "not_applicable"], default: "not_started", required: true },
  owner: { type: String, trim: true, maxlength: 120, default: "" },
  notes: { type: String, trim: true, maxlength: 3000, default: "" },
  evidence: { type: [evidenceSchema], default: [] },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
implementationSchema.index({ organizationId: 1, controlId: 1 }, { unique: true });
implementationSchema.index({ organizationId: 1, status: 1, updatedAt: -1 });

const controlEventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true, index: true },
  controlId: { type: String, required: true, immutable: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  action: { type: String, required: true, immutable: true, enum: ["implementation_updated"] },
  details: { type: Schema.Types.Mixed, default: {}, immutable: true },
  occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
}, { versionKey: false, timestamps: false });
controlEventSchema.index({ organizationId: 1, controlId: 1, occurredAt: -1 });

export type ControlImplementationDocument = InferSchemaType<typeof implementationSchema> & mongoose.Document;
export const ControlImplementation = mongoose.models.ControlImplementation ?? mongoose.model("ControlImplementation", implementationSchema);
export const ControlEvent = mongoose.models.ControlEvent ?? mongoose.model("ControlEvent", controlEventSchema);
