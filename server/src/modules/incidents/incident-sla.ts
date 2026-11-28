export type IncidentSeverity = "p1" | "p2" | "p3" | "p4";

export const incidentSlaMinutes: Record<IncidentSeverity, {
  response: number;
  containment: number;
  resolution: number;
}> = {
  p1: { response: 15, containment: 60, resolution: 240 },
  p2: { response: 60, containment: 240, resolution: 1440 },
  p3: { response: 240, containment: 1440, resolution: 4320 },
  p4: { response: 480, containment: 2880, resolution: 7200 },
};

export function calculateIncidentSla(severity: IncidentSeverity, startedAt = new Date()) {
  const policy = incidentSlaMinutes[severity];
  const addMinutes = (minutes: number) => new Date(startedAt.getTime() + minutes * 60_000);
  return {
    responseDueAt: addMinutes(policy.response),
    containmentDueAt: addMinutes(policy.containment),
    resolutionDueAt: addMinutes(policy.resolution),
  };
}
