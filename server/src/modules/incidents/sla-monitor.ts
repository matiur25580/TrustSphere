export type SlaMilestone = "response" | "containment" | "resolution";

export interface SlaTrackedIncident {
  responseDueAt: Date | null;
  containmentDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstRespondedAt: Date | null;
  containedAt: Date | null;
  resolvedAt: Date | null;
  status: string;
}

export function findBreachedMilestones(incident: SlaTrackedIncident, now = new Date()): SlaMilestone[] {
  if (["resolved", "closed"].includes(incident.status)) return [];
  const breached: SlaMilestone[] = [];
  if (!incident.firstRespondedAt && incident.responseDueAt && incident.responseDueAt.getTime() <= now.getTime()) {
    breached.push("response");
  }
  if (!incident.containedAt && incident.containmentDueAt && incident.containmentDueAt.getTime() <= now.getTime()) {
    breached.push("containment");
  }
  if (!incident.resolvedAt && incident.resolutionDueAt && incident.resolutionDueAt.getTime() <= now.getTime()) {
    breached.push("resolution");
  }
  return breached;
}

export function describeSlaBreach(milestone: SlaMilestone) {
  const labels: Record<SlaMilestone, { title: string; message: string }> = {
    response: { title: "Incident response SLA breached", message: "The first-response deadline has passed without a recorded response." },
    containment: { title: "Incident containment SLA breached", message: "The containment deadline has passed without the incident being contained." },
    resolution: { title: "Incident resolution SLA breached", message: "The resolution deadline has passed while the incident remains unresolved." },
  };
  return labels[milestone];
}
