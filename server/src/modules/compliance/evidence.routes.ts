import { randomUUID, createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { authenticate, requirePermission, requireTenant } from "../identity/identity.middleware.js";
import { ControlImplementation } from "./compliance.models.js";
import { ComplianceEvidence, EvidenceEvent } from "./evidence.models.js";

export const evidenceRouter = Router();
evidenceRouter.use(authenticate, requireTenant);

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const storageDirectory = path.resolve(process.env.EVIDENCE_STORAGE_DIR || ".trustsphere-private-evidence");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 4 } });

function detectMime(buffer: Buffer): "application/pdf" | "image/png" | "image/jpeg" | "text/plain" | null {
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (!buffer.includes(0) && Buffer.from(buffer.toString("utf8"), "utf8").equals(buffer)) return "text/plain";
  return null;
}

function safeFileName(value: string) {
  const name = path.basename(value).replace(/[^a-zA-Z0-9._ -]/g, "_").trim();
  return (name || "evidence-file").slice(0, 180);
}

async function appendEvidenceEvent(input: { organizationId: string; evidenceId: string; actorId: string; action: "uploaded" | "approved" | "rejected" | "downloaded"; details?: Record<string, unknown> }) {
  await EvidenceEvent.create(input);
}

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().trim().max(2000).optional(),
}).strict();

evidenceRouter.post("/", requirePermission("compliance:write"), (req, res, next) => {
  upload.single("file")(req, res, async error => {
    if (error) {
      res.status(error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
        .json({ error: { code: "UPLOAD_REJECTED", message: error.message } });
      return;
    }
    try {
      const controlId = typeof req.body.controlId === "string" ? req.body.controlId : "";
      const expiresAtRaw = typeof req.body.expiresAt === "string" ? req.body.expiresAt : "";
      const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
      if (!["access-mfa", "access-review", "security-policy", "risk-assessment", "encryption", "logging-monitoring", "incident-response", "backup-recovery", "supplier-security", "change-management"].includes(controlId)) {
        res.status(400).json({ error: { code: "INVALID_CONTROL", message: "Choose a valid control from the catalog." } }); return;
      }
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        res.status(400).json({ error: { code: "INVALID_EXPIRY", message: "Provide a valid evidence expiry date." } }); return;
      }
      if (!req.file || !req.file.buffer.length) {
        res.status(400).json({ error: { code: "FILE_REQUIRED", message: "Choose a file to upload." } }); return;
      }
      const mimeType = detectMime(req.file.buffer);
      if (!mimeType) {
        res.status(415).json({ error: { code: "UNSUPPORTED_FILE_TYPE", message: "Only valid PDF, PNG, JPEG and UTF-8 text files are accepted." } }); return;
      }
      const organizationId = req.tenant!.organizationId;
      const storageKey = randomUUID();
      const targetDirectory = path.join(storageDirectory, organizationId);
      await mkdir(targetDirectory, { recursive: true, mode: 0o700 });
      const targetPath = path.join(targetDirectory, storageKey);
      await writeFile(targetPath, req.file.buffer, { flag: "wx", mode: 0o600 });
      try {
        const evidence = await ComplianceEvidence.create({
          organizationId, controlId, uploadedBy: req.auth!.userId,
          fileName: safeFileName(req.file.originalname), mimeType, sizeBytes: req.file.size,
          sha256: createHash("sha256").update(req.file.buffer).digest("hex"),
          storageKey, status: "pending_review", expiresAt,
        });
        await appendEvidenceEvent({ organizationId, evidenceId: String(evidence._id), actorId: req.auth!.userId, action: "uploaded", details: { controlId, sizeBytes: evidence.sizeBytes } });
        res.status(201).json({ data: evidence });
      } catch (databaseError) {
        await unlink(targetPath).catch(() => undefined);
        throw databaseError;
      }
    } catch (caught) { next(caught); }
  });
});

evidenceRouter.get("/", requirePermission("compliance:read"), async (req, res, next) => {
  try {
    const controlId = typeof req.query.controlId === "string" ? req.query.controlId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !["pending_review", "approved", "rejected", "expired"].includes(status)) {
      res.status(400).json({ error: { code: "INVALID_STATUS", message: "Choose a valid evidence status." } }); return;
    }
    const filter: Record<string, unknown> = { organizationId: req.tenant!.organizationId };
    if (controlId) filter.controlId = controlId;
    if (status) filter.status = status;
    const records = await ComplianceEvidence.find(filter).sort({ createdAt: -1 }).limit(100)
      .select("-storageKey -__v").lean();
    res.json({ data: records });
  } catch (error) { next(error); }
});

evidenceRouter.post("/:id/review", requirePermission("compliance:write"), async (req, res, next) => {
  try {
    if (!["owner", "admin"].includes(req.tenant!.role)) {
      res.status(403).json({ error: { code: "REVIEWER_REQUIRED", message: "Only owners and admins can review evidence." } }); return;
    }
    if (!isValidObjectId(req.params.id)) {
      res.status(400).json({ error: { code: "INVALID_EVIDENCE_ID", message: "Evidence identifier is invalid." } }); return;
    }
    const input = reviewSchema.parse(req.body);
    const evidence = await ComplianceEvidence.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId });
    if (!evidence) { res.status(404).json({ error: { code: "EVIDENCE_NOT_FOUND", message: "Evidence not found." } }); return; }
    if (evidence.status !== "pending_review") {
      res.status(409).json({ error: { code: "EVIDENCE_ALREADY_REVIEWED", message: "Only pending evidence can be reviewed." } }); return;
    }
    if (String(evidence.uploadedBy) === req.auth!.userId) {
      res.status(403).json({ error: { code: "SELF_REVIEW_FORBIDDEN", message: "Evidence uploaders cannot review their own evidence." } }); return;
    }
    evidence.status = input.decision;
    evidence.reviewedBy = req.auth!.userId as never;
    evidence.reviewedAt = new Date();
    evidence.reviewComment = input.comment ?? "";
    await evidence.save();
    await appendEvidenceEvent({ organizationId: req.tenant!.organizationId, evidenceId: String(evidence._id), actorId: req.auth!.userId, action: input.decision, details: { comment: input.comment ?? "" } });
    res.json({ data: evidence });
  } catch (error) { next(error); }
});

evidenceRouter.get("/:id/download", requirePermission("compliance:read"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { res.status(400).json({ error: { code: "INVALID_EVIDENCE_ID", message: "Evidence identifier is invalid." } }); return; }
    const evidence = await ComplianceEvidence.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId });
    if (!evidence) { res.status(404).json({ error: { code: "EVIDENCE_NOT_FOUND", message: "Evidence not found." } }); return; }
    const filePath = path.join(storageDirectory, req.tenant!.organizationId, evidence.storageKey);
    res.setHeader("Content-Type", evidence.mimeType);
    res.setHeader("Content-Length", evidence.sizeBytes);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(evidence.fileName)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    const stream = createReadStream(filePath);
    stream.on("error", error => {
      if (!res.headersSent) res.status(404).json({ error: { code: "EVIDENCE_FILE_MISSING", message: "The stored evidence file is unavailable." } });
      else res.destroy(error);
    });
    stream.pipe(res);
    await appendEvidenceEvent({ organizationId: req.tenant!.organizationId, evidenceId: String(evidence._id), actorId: req.auth!.userId, action: "downloaded" });
  } catch (error) { next(error); }
});

evidenceRouter.get("/:id/events", requirePermission("compliance:read"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) { res.status(400).json({ error: { code: "INVALID_EVIDENCE_ID", message: "Evidence identifier is invalid." } }); return; }
    const evidence = await ComplianceEvidence.findOne({ _id: req.params.id, organizationId: req.tenant!.organizationId }).select("_id").lean();
    if (!evidence) { res.status(404).json({ error: { code: "EVIDENCE_NOT_FOUND", message: "Evidence not found." } }); return; }
    const events = await EvidenceEvent.find({ organizationId: req.tenant!.organizationId, evidenceId: evidence._id }).sort({ occurredAt: -1 }).limit(50).lean();
    res.json({ data: events });
  } catch (error) { next(error); }
});
