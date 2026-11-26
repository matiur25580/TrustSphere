import mongoose, { Schema, type InferSchemaType } from "mongoose";

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  status: { type: String, enum: ["active", "suspended"], default: "active", required: true },
}, { timestamps: true });

const organizationSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  status: { type: String, enum: ["active", "suspended"], default: "active", required: true },
}, { timestamps: true });

const membershipSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  role: { type: String, enum: ["owner", "admin", "analyst", "viewer"], required: true },
  status: { type: String, enum: ["active", "invited", "suspended"], default: "active", required: true },
}, { timestamps: true });
membershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });

const refreshSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date, default: null },
  userAgent: { type: String, maxlength: 500 },
  ipAddress: { type: String, maxlength: 64 },
}, { timestamps: true });

export type UserDocument = InferSchemaType<typeof userSchema> & mongoose.Document;
export type MembershipDocument = InferSchemaType<typeof membershipSchema> & mongoose.Document;
export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
export const Organization = mongoose.models.Organization ?? mongoose.model("Organization", organizationSchema);
export const Membership = mongoose.models.Membership ?? mongoose.model("Membership", membershipSchema);
export const RefreshSession = mongoose.models.RefreshSession ?? mongoose.model("RefreshSession", refreshSessionSchema);
