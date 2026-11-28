import nodemailer from "nodemailer";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { Incident } from "../modules/incidents/incident.models.js";
import { Membership, User } from "../modules/identity/identity.models.js";
import { EscalationAuditEvent, EscalationExecution, EscalationNotification, EscalationPolicy, OnCallRotation } from "../modules/escalations/escalation.models.js";
import { dueTierIndexes, escalationDedupeKey, selectOnCallMember, type EscalationTier, type Rotation } from "../modules/escalations/escalation.execution.js";

const POLL_INTERVAL_MS = 30_000;
const terminalStatuses = ["resolved", "closed"];
const mailer = env.SMTP_HOST && env.SMTP_FROM ? nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, ...(env.SMTP_USER && env.SMTP_PASSWORD ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}) }) : null;

type IncidentCandidate = { _id: unknown; organizationId: unknown; title: string; severity: "p1" | "p2" | "p3" | "p4"; status: string; assignedTo: unknown; reportedAt: Date };
type PolicyCandidate = { _id: unknown; organizationId: unknown; name: string; tiers: EscalationTier[] };

async function recipientsForTier(incident: IncidentCandidate, tier: EscalationTier, now: Date): Promise<string[]> {
  const organizationId = String(incident.organizationId);
  if (tier.target === "incident_assignee") return incident.assignedTo ? [String(incident.assignedTo)] : [];
  if (tier.target === "organization_admins") {
    const memberships = await Membership.find({ organizationId, status: "active", role: { $in: ["owner", "admin"] } }).select("userId").lean();
    return [...new Set(memberships.map(item => String(item.userId)))];
  }
  if (!tier.rotationId) return [];
  const rotation = await OnCallRotation.findOne({ _id: tier.rotationId, organizationId, active: true }).lean() as unknown as (Rotation & { _id: unknown }) | null;
  if (!rotation) return [];
  const selected = selectOnCallMember({ ...rotation, startsAt: new Date(rotation.startsAt), members: rotation.members.map((member: any) => ({ userId: String(member.userId), position: member.position })) }, now);
  return selected ? [selected] : [];
}

async function appendAudit(input: { organizationId: string; incidentId: string; executionId: string; policyId: string; tierIndex: number; action: string; details?: Record<string, unknown> }) {
  await EscalationAuditEvent.create({ ...input, details: input.details ?? {}, occurredAt: new Date() });
}

async function sendTier(incident: IncidentCandidate, policy: PolicyCandidate, tierIndex: number, now: Date) {
  const organizationId = String(incident.organizationId);
  const incidentId = String(incident._id);
  const policyId = String(policy._id);
  const dedupeKey = escalationDedupeKey(organizationId, incidentId, policyId, tierIndex);
  let execution = await EscalationExecution.findOne({ dedupeKey });
  if (execution?.status === "completed" || execution?.status === "processing") return;
  if (execution?.status === "failed") {
    const claimed = await EscalationExecution.updateOne({ _id: execution._id, status: "failed" }, { $set: { status: "processing", startedAt: now, failureReason: null }, $inc: { attempts: 1 } });
    if (!claimed.modifiedCount) return;
    execution = await EscalationExecution.findById(execution._id);
  } else {
    try {
      execution = await EscalationExecution.create({ organizationId, incidentId, policyId, tierIndex, dedupeKey, status: "processing", attempts: 1, startedAt: now });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return;
      throw error;
    }
  }
  if (!execution) return;
  const executionId = String(execution._id);
  await appendAudit({ organizationId, incidentId, executionId, policyId, tierIndex, action: "tier_started", details: { policyName: policy.name, target: policy.tiers[tierIndex].target } });
  try {
    const recipientIds = await recipientsForTier(incident, policy.tiers[tierIndex], now);
    await appendAudit({ organizationId, incidentId, executionId, policyId, tierIndex, action: "recipient_resolved", details: { recipientCount: recipientIds.length } });
    if (recipientIds.length === 0) throw new Error("No eligible recipient could be resolved for this escalation tier.");
    const users = await User.find({ _id: { $in: recipientIds }, status: "active" }).select("name email").lean();
    const title = `Incident escalation: ${incident.title}`;
    const message = `The ${incident.severity.toUpperCase()} incident "${incident.title}" has reached escalation tier ${tierIndex + 1} under policy "${policy.name}".`;
    for (const user of users) {
      const userId = String(user._id);
      const inAppKey = `${dedupeKey}:${userId}:in_app`;
      try {
        await EscalationNotification.create({ organizationId, incidentId, executionId, recipientId: userId, channel: "in_app", dedupeKey: inAppKey, status: "sent", title, message, sentAt: now });
      } catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
      if (mailer && user.email) {
        const emailKey = `${dedupeKey}:${userId}:email`;
        let emailRecord = await EscalationNotification.findOne({ dedupeKey: emailKey });
        if (emailRecord?.status !== "sent") {
          if (!emailRecord) {
            try { emailRecord = await EscalationNotification.create({ organizationId, incidentId, executionId, recipientId: userId, channel: "email", dedupeKey: emailKey, status: "pending", title, message }); }
            catch (error) { if ((error as { code?: number }).code !== 11000) throw error; emailRecord = await EscalationNotification.findOne({ dedupeKey: emailKey }); }
          }
          if (emailRecord && emailRecord.status !== "sent") {
            try {
              const result = await mailer.sendMail({ from: env.SMTP_FROM, to: user.email, subject: title, text: message, messageId: `<${Buffer.from(emailKey).toString("hex")}@trustsphere.local>` });
              await EscalationNotification.updateOne({ _id: emailRecord._id }, { $set: { status: "sent", providerMessageId: result.messageId ?? null, sentAt: new Date(), failureReason: null } });
            } catch (error) {
              const reason = error instanceof Error ? error.message.slice(0, 1000) : "Email delivery failed";
              await EscalationNotification.updateOne({ _id: emailRecord._id }, { $set: { status: "failed", failureReason: reason } });
              throw error;
            }
          }
        }
      }
    }
    await EscalationExecution.updateOne({ _id: execution._id }, { $set: { status: "completed", recipientIds: users.map(user => user._id), completedAt: new Date(), failureReason: null } });
    await appendAudit({ organizationId, incidentId, executionId, policyId, tierIndex, action: "tier_completed", details: { recipientCount: users.length, emailEnabled: Boolean(mailer) } });
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 1000) : "Unknown escalation execution failure";
    await EscalationExecution.updateOne({ _id: execution._id }, { $set: { status: "failed", failureReason: reason } });
    await appendAudit({ organizationId, incidentId, executionId, policyId, tierIndex, action: "tier_failed", details: { reason } });
    throw error;
  }
}

async function scan() {
  const now = new Date();
  const incidents = await Incident.find({ status: { $nin: terminalStatuses } }).select("_id organizationId title severity status assignedTo reportedAt").lean() as unknown as IncidentCandidate[];
  for (const incident of incidents) {
    const policies = await EscalationPolicy.find({ organizationId: incident.organizationId, severity: incident.severity, active: true }).lean() as unknown as PolicyCandidate[];
    for (const policy of policies) {
      const due = dueTierIndexes(policy.tiers, new Date(incident.reportedAt), now);
      for (const tierIndex of due) {
        try { await sendTier(incident, policy, tierIndex, now); }
        catch (error) { console.error("Incident escalation tier failed", { incidentId: String(incident._id), policyId: String(policy._id), tierIndex, error: error instanceof Error ? error.message : error }); }
      }
    }
  }
  if (incidents.length) console.info("Incident escalation scan completed", { incidents: incidents.length, scannedAt: now.toISOString() });
}

async function start() {
  await connectDatabase();
  let running = false;
  const run = async () => { if (running) return; running = true; try { await scan(); } catch (error) { console.error("Escalation scan failed", error); } finally { running = false; } };
  await run();
  const timer = setInterval(() => void run(), POLL_INTERVAL_MS);
  console.info("TrustSphere escalation worker started", { pollIntervalMs: POLL_INTERVAL_MS, emailEnabled: Boolean(mailer) });
  const shutdown = async (signal: string) => { console.info(`${signal} received; shutting down escalation worker`); clearInterval(timer); await disconnectDatabase(); process.exit(0); };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
start().catch(async error => { console.error("Failed to start TrustSphere escalation worker:", error); await disconnectDatabase().catch(() => undefined); process.exit(1); });
