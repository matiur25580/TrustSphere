import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Incident } from "../modules/incidents/incident.models.js";
import { describeSlaBreach, findBreachedMilestones, type SlaMilestone } from "../modules/incidents/sla-monitor.js";
import { IncidentSlaBreach, SecurityNotification } from "../modules/notifications/notification.models.js";
import { Membership } from "../modules/identity/identity.models.js";

const POLL_INTERVAL_MS = 60_000;
type TrackedIncident = {
  _id: unknown; organizationId: unknown; assignedTo: unknown; title: string; severity: "p1" | "p2" | "p3" | "p4";
  status: string; responseDueAt: Date | null; containmentDueAt: Date | null; resolutionDueAt: Date | null;
  firstRespondedAt: Date | null; containedAt: Date | null; resolvedAt: Date | null;
};

async function notifyRecipients(incident: TrackedIncident, milestone: SlaMilestone, now: Date) {
  const organizationId = String(incident.organizationId);
  const incidentId = String(incident._id);
  const breach = await IncidentSlaBreach.findOneAndUpdate(
    { organizationId, incidentId, milestone },
    { $setOnInsert: { organizationId, incidentId, milestone, severity: incident.severity, breachedAt: now } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  if (!breach) throw new Error("Unable to persist SLA breach record.");

  const recipients = new Set<string>();
  if (incident.assignedTo) recipients.add(String(incident.assignedTo));
  const administrators = await Membership.find({
    organizationId, status: "active", role: { $in: ["owner", "admin"] },
  }).select("userId").lean();
  for (const membership of administrators) recipients.add(String(membership.userId));

  const description = describeSlaBreach(milestone);
  for (const recipientId of recipients) {
    const dedupeKey = `${organizationId}:${incidentId}:${milestone}:${recipientId}`;
    try {
      await SecurityNotification.create({
        organizationId, recipientId, type: "incident_sla_breach", dedupeKey,
        incidentId, incidentTitle: incident.title, severity: incident.severity, milestone,
        title: description.title, message: description.message,
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
}

async function scan() {
  const now = new Date();
  const incidents = await Incident.find({
    status: { $nin: ["resolved", "closed"] },
    $or: [
      { firstRespondedAt: null, responseDueAt: { $lte: now } },
      { containedAt: null, containmentDueAt: { $lte: now } },
      { resolvedAt: null, resolutionDueAt: { $lte: now } },
    ],
  }).select("_id organizationId assignedTo title severity status responseDueAt containmentDueAt resolutionDueAt firstRespondedAt containedAt resolvedAt").lean() as unknown as TrackedIncident[];

  for (const incident of incidents) {
    const milestones = findBreachedMilestones(incident, now);
    for (const milestone of milestones) await notifyRecipients(incident, milestone, now);
  }
  if (incidents.length > 0) {
    console.info("SLA monitor scan completed", { candidateIncidents: incidents.length, scannedAt: now.toISOString() });
  }
}

async function start() {
  await connectDatabase();
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await scan(); }
    catch (error) { console.error("SLA monitor scan failed", error); }
    finally { running = false; }
  };
  await run();
  const timer = setInterval(() => void run(), POLL_INTERVAL_MS);
  console.info("TrustSphere SLA monitor started", { pollIntervalMs: POLL_INTERVAL_MS });

  const shutdown = async (signal: string) => {
    console.info(`${signal} received; shutting down SLA monitor`);
    clearInterval(timer);
    await disconnectDatabase();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch(async error => {
  console.error("Failed to start TrustSphere SLA monitor:", error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
