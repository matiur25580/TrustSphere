import { createHash } from "node:crypto";
import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { SavedReport } from "../modules/reports/saved-report.models.js";
import { SavedReportDelivery } from "../modules/reports/saved-report-delivery.models.js";
import { buildReport, buildReportCsv } from "../modules/reports/report.routes.js";
import { scheduleToCron } from "../modules/reports/saved-report-schedule.js";

const QUEUE_NAME = "trustsphere-saved-report-delivery";
const SYNC_INTERVAL_MS = 60_000;
type DeliveryJob = { organizationId: string; savedReportId: string };

function requiredWorkerConfig() {
  if (!env.REDIS_URL || !env.SMTP_HOST || !env.SMTP_FROM) {
    throw new Error("Saved report worker requires REDIS_URL, SMTP_HOST and SMTP_FROM. Configure these in the worker environment.");
  }
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
    throw new Error("Configure both SMTP_USER and SMTP_PASSWORD, or leave both empty for an unauthenticated relay.");
  }
}

const redisConnection = () => new IORedis(env.REDIS_URL!, { maxRetriesPerRequest: null });
const createMailer = () => nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  ...(env.SMTP_USER && env.SMTP_PASSWORD ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
});

async function createPdfAttachment(report: Awaited<ReturnType<typeof buildReport>>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ margin: 44, size: "A4" });
    const chunks: Buffer[] = [];
    document.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.fontSize(20).text("TrustSphere Risk Intelligence Report");
    document.moveDown(0.3);
    document.fontSize(9).fillColor("#667085").text(
      `Period: ${report.meta.startDate.toISOString().slice(0, 10)} to ${report.meta.endDate.toISOString().slice(0, 10)} · Generated: ${report.meta.generatedAt.toISOString()}`,
    );
    document.moveDown();
    document.fillColor("#101828").fontSize(13).text("Executive summary");
    document.moveDown(0.3);
    for (const [label, value] of Object.entries(report.summary)) {
      document.fontSize(9).text(`${label}: ${value === null ? "N/A" : String(value)}`);
    }
    document.moveDown();
    document.fontSize(13).text("Risk and control distributions");
    for (const [section, values] of Object.entries(report.distributions)) {
      document.moveDown(0.35);
      document.fontSize(10).text(section);
      for (const item of values) document.fontSize(8).text(`  ${item.label}: ${item.count}`);
    }
    document.moveDown();
    document.fontSize(8).fillColor("#667085").text(
      "Decision-support information only. This report is not a certification, audit opinion or regulatory determination.",
    );
    document.end();
  });
}

function attachmentName(name: string, extension: string) {
  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "saved-report";
  return `trustsphere-${safe}.${extension}`;
}

async function deliverSavedReport(job: Job<DeliveryJob>, transporter: ReturnType<typeof createMailer>) {
  const { organizationId, savedReportId } = job.data;
  const reportDefinition = await SavedReport.findOne({
    _id: savedReportId, organizationId, archivedAt: null, enabled: true,
  }).lean() as unknown as {
    _id: string;
    name: string;
    range: "7d" | "30d" | "90d";
    format: "csv" | "pdf";
    recipients: string[];
    schedule: { frequency: "manual" | "weekly" | "monthly"; dayOfWeek: number | null; dayOfMonth: number | null; localTime: string; timeZone: string };
  } | null;

  if (!reportDefinition || reportDefinition.schedule.frequency === "manual" || reportDefinition.recipients.length === 0) {
    return { skipped: true, reason: "Saved report is no longer scheduled or has no recipients." };
  }

  const idempotencyKey = `${organizationId}:${savedReportId}:${job.id ?? job.timestamp}`;
  const scheduledFor = new Date(job.timestamp);
  let delivery = await SavedReportDelivery.findOne({ idempotencyKey });

  if (delivery?.status === "sent") return { skipped: true, reason: "Delivery already completed." };

  if (!delivery) {
    try {
      delivery = await SavedReportDelivery.create({
        organizationId, savedReportId, savedReportName: reportDefinition.name, idempotencyKey,
        status: "processing", format: reportDefinition.format, range: reportDefinition.range,
        recipients: reportDefinition.recipients, attempts: 0, scheduledFor, startedAt: new Date(),
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      delivery = await SavedReportDelivery.findOne({ idempotencyKey });
      if (delivery?.status === "sent") return { skipped: true, reason: "Delivery already completed." };
    }
  }

  if (!delivery) throw new Error("Unable to create or recover the delivery history record.");
  await SavedReportDelivery.updateOne(
    { _id: delivery._id, status: { $ne: "sent" } },
    { $set: { status: "processing", startedAt: new Date(), failureReason: null }, $inc: { attempts: 1 } },
  );

  try {
    const report = await buildReport(organizationId, reportDefinition.range);
    const isPdf = reportDefinition.format === "pdf";
    const content = isPdf ? await createPdfAttachment(report) : Buffer.from(buildReportCsv(report), "utf8");
    const extension = isPdf ? "pdf" : "csv";
    const messageKey = createHash("sha256").update(idempotencyKey).digest("hex");
    const result = await transporter.sendMail({
      from: env.SMTP_FROM,
      to: reportDefinition.recipients,
      subject: `TrustSphere report: ${reportDefinition.name}`,
      text: [
        `Your scheduled TrustSphere report "${reportDefinition.name}" is attached.`,
        `Reporting period: ${report.meta.startDate.toISOString().slice(0, 10)} to ${report.meta.endDate.toISOString().slice(0, 10)}.`,
        "This is an automated message. Replies are not monitored.",
      ].join("\n"),
      messageId: `<${messageKey}@trustsphere.local>`,
      headers: { "X-TrustSphere-Delivery-Key": messageKey },
      attachments: [{
        filename: attachmentName(reportDefinition.name, extension),
        content,
        contentType: isPdf ? "application/pdf" : "text/csv; charset=utf-8",
      }],
    });
    await SavedReportDelivery.updateOne(
      { _id: delivery._id },
      { $set: { status: "sent", providerMessageId: result.messageId ?? null, completedAt: new Date(), failureReason: null } },
    );
    return { sent: true, deliveryId: String(delivery._id) };
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 1000) : "Unknown delivery failure";
    await SavedReportDelivery.updateOne({ _id: delivery._id }, { $set: { status: "failed", failureReason: reason } });
    throw error;
  }
}

async function start() {
  requiredWorkerConfig();
  await connectDatabase();

  const queueConnection = redisConnection();
  const workerConnection = redisConnection();
  const queue = new Queue<DeliveryJob>(QUEUE_NAME, { connection: queueConnection });
  const transporter = createMailer();
  const worker = new Worker<DeliveryJob>(
    QUEUE_NAME,
    job => deliverSavedReport(job, transporter),
    { connection: workerConnection, concurrency: 5 },
  );

  worker.on("failed", (job, error) => console.error("Saved report delivery attempt failed", { jobId: job?.id, error: error.message }));
  worker.on("completed", job => console.info("Saved report delivery job completed", { jobId: job.id }));

  let syncing = false;
  const syncSchedulers = async () => {
    if (syncing) return;
    syncing = true;
    try {
      const definitions = await SavedReport.find({}).select("_id organizationId schedule enabled recipients archivedAt").lean() as unknown as Array<{
        _id: unknown;
        organizationId: unknown;
        schedule: { frequency: "manual" | "weekly" | "monthly"; dayOfWeek: number | null; dayOfMonth: number | null; localTime: string; timeZone: string };
        enabled: boolean;
        recipients: string[];
        archivedAt: Date | null;
      }>;
      for (const definition of definitions) {
        const schedulerId = `saved-report:${String(definition._id)}`;
        const active = definition.enabled && !definition.archivedAt && definition.recipients.length > 0;
        const pattern = active ? scheduleToCron(definition.schedule) : null;
        if (!pattern) {
          await queue.removeJobScheduler(schedulerId).catch(() => undefined);
          continue;
        }
        await queue.upsertJobScheduler(
          schedulerId,
          { pattern, tz: definition.schedule.timeZone },
          {
            name: "deliver-saved-report",
            data: { organizationId: String(definition.organizationId), savedReportId: String(definition._id) },
            opts: {
              attempts: 5,
              backoff: { type: "exponential", delay: 30_000 },
              removeOnComplete: 1000,
              removeOnFail: 5000,
            },
          },
        );
      }
    } catch (error) {
      console.error("Unable to synchronize saved report schedules", error);
    } finally {
      syncing = false;
    }
  };

  await syncSchedulers();
  const syncTimer = setInterval(() => void syncSchedulers(), SYNC_INTERVAL_MS);
  console.info("TrustSphere saved report worker started");

  const shutdown = async (signal: string) => {
    console.info(`${signal} received; shutting down saved report worker`);
    clearInterval(syncTimer);
    await worker.close();
    await queue.close();
    await Promise.all([queueConnection.quit(), workerConnection.quit()]);
    await disconnectDatabase();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch(async error => {
  console.error("Failed to start saved report worker:", error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
