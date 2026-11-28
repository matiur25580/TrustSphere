import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { authenticate, requirePermission, requireTenant } from "../identity/identity.middleware.js";
import { SavedReport } from "./saved-report.models.js";

export const savedReportRouter = Router();
savedReportRouter.use(authenticate, requireTenant);

const scheduleSchema = z.object({
  frequency: z.enum(["manual", "weekly", "monthly"]).default("manual"),
  dayOfWeek: z.number().int().min(0).max(6).nullable().default(null),
  dayOfMonth: z.number().int().min(1).max(28).nullable().default(null),
  localTime: z.string().regex(/^(?:[01]\\d|2[0-3]):[0-5]\\d$/).default("09:00"),
  timeZone: z.string().trim().min(1).max(80).default("UTC").refine(value => {
    try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; }
  }, "A valid IANA time zone is required."),
}).superRefine((value, context) => {
  if (value.frequency === "weekly" && value.dayOfWeek === null) context.addIssue({ code: "custom", path: ["dayOfWeek"], message: "Choose a weekday for weekly schedules." });
  if (value.frequency === "monthly" && value.dayOfMonth === null) context.addIssue({ code: "custom", path: ["dayOfMonth"], message: "Choose a day for monthly schedules." });
  if (value.frequency !== "weekly" && value.dayOfWeek !== null) context.addIssue({ code: "custom", path: ["dayOfWeek"], message: "Weekday is only valid for weekly schedules." });
  if (value.frequency !== "monthly" && value.dayOfMonth !== null) context.addIssue({ code: "custom", path: ["dayOfMonth"], message: "Day of month is only valid for monthly schedules." });
});

const definitionSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(""),
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
  format: z.enum(["csv", "pdf"]).default("csv"),
  recipients: z.array(z.string().trim().email().max(254)).max(10).default([]),
  schedule: scheduleSchema.default({ frequency: "manual", dayOfWeek: null, dayOfMonth: null, localTime: "09:00", timeZone: "UTC" }),
  enabled: z.boolean().default(true),
}).strict();

const updateSchema = definitionSchema.partial().refine(value => Object.keys(value).length > 0, "Provide at least one field to update");

savedReportRouter.get("/", requirePermission("reports:read"), async (req, res, next) => {
  try {
    const items = await SavedReport.find({ organizationId: req.tenant!.organizationId, archivedAt: null })
      .sort({ updatedAt: -1, _id: 1 }).limit(100).lean();
    res.json({ data: items });
  } catch (error) { next(error); }
});

savedReportRouter.post("/", requirePermission("reports:manage"), async (req, res, next) => {
  try {
    const input = definitionSchema.parse(req.body);
    const item = await SavedReport.create({
      ...input,
      recipients: [...new Set(input.recipients.map(value => value.toLowerCase()))],
      organizationId: req.tenant!.organizationId,
      createdBy: req.auth!.userId,
      updatedBy: req.auth!.userId,
    });
    res.status(201).json({ data: item });
  } catch (error) { next(error); }
});

savedReportRouter.patch("/:id", requirePermission("reports:manage"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { res.status(404).json({ error: { code: "SAVED_REPORT_NOT_FOUND", message: "Saved report not found." } }); return; }
    const input = updateSchema.parse(req.body);
    if (input.recipients) input.recipients = [...new Set(input.recipients.map(value => value.toLowerCase()))];
    const item = await SavedReport.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.tenant!.organizationId, archivedAt: null },
      { $set: { ...input, updatedBy: req.auth!.userId } },
      { new: true, runValidators: true },
    ).lean();
    if (!item) { res.status(404).json({ error: { code: "SAVED_REPORT_NOT_FOUND", message: "Saved report not found." } }); return; }
    res.json({ data: item });
  } catch (error) { next(error); }
});

savedReportRouter.delete("/:id", requirePermission("reports:manage"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { res.status(404).json({ error: { code: "SAVED_REPORT_NOT_FOUND", message: "Saved report not found." } }); return; }
    const item = await SavedReport.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.tenant!.organizationId, archivedAt: null },
      { $set: { archivedAt: new Date(), enabled: false, updatedBy: req.auth!.userId } },
      { new: true },
    ).lean();
    if (!item) { res.status(404).json({ error: { code: "SAVED_REPORT_NOT_FOUND", message: "Saved report not found." } }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});
