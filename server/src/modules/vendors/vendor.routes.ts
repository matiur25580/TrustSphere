import { Router } from "express";
import { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import { authenticate, requirePermission, requireTenant } from "../identity/identity.middleware.js";
import { Vendor } from "./vendor.models.js";

export const vendorRouter = Router();
vendorRouter.use(authenticate, requireTenant);

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  website: z.string().trim().max(300).refine(value => !value || /^https?:\/\//i.test(value), "Website must start with http:// or https://").optional(),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).optional(),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().email().max(254).or(z.literal("")).optional(),
  criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  dataSensitivity: z.enum(["public", "internal", "confidential", "restricted"]).default("internal"),
  accessLevel: z.enum(["none", "limited", "privileged"]).default("limited"),
  status: z.enum(["onboarding", "active", "under_review", "suspended", "offboarded"]).default("onboarding"),
}).strict();

const updateSchema = createSchema.partial().refine(value => Object.keys(value).length > 0, "Provide at least one field to update");

function calculateRisk(input: { criticality: string; dataSensitivity: string; accessLevel: string }) {
  const criticality = { low: 15, medium: 35, high: 60, critical: 75 }[input.criticality] ?? 35;
  const sensitivity = { public: 0, internal: 5, confidential: 12, restricted: 18 }[input.dataSensitivity] ?? 5;
  const access = { none: 0, limited: 5, privileged: 12 }[input.accessLevel] ?? 5;
  const score = Math.min(100, criticality + sensitivity + access);
  const band = score >= 80 ? "critical" : score >= 60 ? "high" : score >= 35 ? "medium" : "low";
  return { riskScore: score, riskBand: band };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

vendorRouter.get("/", requirePermission("vendors:read"), async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit ?? "10"), 10) || 10));
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const riskBand = typeof req.query.riskBand === "string" ? req.query.riskBand : "";
    const allowedSort = ["createdAt", "name", "riskScore", "updatedAt"] as const;
    const sortBy = allowedSort.includes(req.query.sortBy as typeof allowedSort[number]) ? req.query.sortBy as string : "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const filter: Record<string, unknown> = { organizationId: req.tenant!.organizationId, archivedAt: null };
    if (search) {
      const expression = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: expression }, { category: expression }, { contactEmail: expression }];
    }
    if (["onboarding", "active", "under_review", "suspended", "offboarded"].includes(status)) filter.status = status;
    if (["low", "medium", "high", "critical"].includes(riskBand)) filter.riskBand = riskBand;
    const [items, total] = await Promise.all([
      Vendor.find(filter).sort({ [sortBy]: sortOrder, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Vendor.countDocuments(filter),
    ]);
    res.json({ data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

vendorRouter.get("/summary", requirePermission("vendors:read"), async (req, res, next) => {
  try {
    const rows = await Vendor.aggregate([
      { $match: { organizationId: new Types.ObjectId(req.tenant!.organizationId), archivedAt: null } },
      { $group: { _id: null, total: { $sum: 1 }, highRisk: { $sum: { $cond: [{ $in: ["$riskBand", ["high", "critical"]] }, 1, 0] } }, active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } }, review: { $sum: { $cond: [{ $eq: ["$status", "under_review"] }, 1, 0] } }, averageRisk: { $avg: "$riskScore" } } },
    ]);
    res.json({ data: rows[0] ?? { total: 0, highRisk: 0, active: 0, review: 0, averageRisk: 0 } });
  } catch (error) { next(error); }
});

vendorRouter.post("/", requirePermission("vendors:write"), async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const risk = calculateRisk(input);
    const vendor = await Vendor.create({
      ...input, organizationId: req.tenant!.organizationId, createdBy: req.auth!.userId, updatedBy: req.auth!.userId,
      normalizedName: input.name.toLowerCase(), ...risk,
    });
    res.status(201).json({ data: vendor });
  } catch (error) { next(error); }
});

vendorRouter.get("/:id", requirePermission("vendors:read"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { res.status(404).json({ error: { code: "VENDOR_NOT_FOUND", message: "Vendor not found." } }); return; }
    const vendor = await Vendor.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId, archivedAt: null }).lean();
    if (!vendor) { res.status(404).json({ error: { code: "VENDOR_NOT_FOUND", message: "Vendor not found." } }); return; }
    res.json({ data: vendor });
  } catch (error) { next(error); }
});

vendorRouter.patch("/:id", requirePermission("vendors:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { res.status(404).json({ error: { code: "VENDOR_NOT_FOUND", message: "Vendor not found." } }); return; }
    const input = updateSchema.parse(req.body);
    const existing = await Vendor.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId, archivedAt: null });
    if (!existing) { res.status(404).json({ error: { code: "VENDOR_NOT_FOUND", message: "Vendor not found." } }); return; }
    Object.assign(existing, input);
    if (input.name) existing.normalizedName = input.name.toLowerCase();
    existing.set("updatedBy", req.auth!.userId);
    const risk = calculateRisk({ criticality: existing.criticality, dataSensitivity: existing.dataSensitivity, accessLevel: existing.accessLevel });
    existing.riskScore = risk.riskScore;
    existing.riskBand = risk.riskBand;
    await existing.save();
    res.json({ data: existing });
  } catch (error) { next(error); }
});

vendorRouter.delete("/:id", requirePermission("vendors:write"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { res.status(404).json({ error: { code: "VENDOR_NOT_FOUND", message: "Vendor not found." } }); return; }
    const vendor = await Vendor.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.tenant!.organizationId, archivedAt: null },
      { $set: { archivedAt: new Date(), status: "offboarded", updatedBy: req.auth!.userId } },
      { new: true },
    );
    if (!vendor) { res.status(404).json({ error: { code: "VENDOR_NOT_FOUND", message: "Vendor not found." } }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});
