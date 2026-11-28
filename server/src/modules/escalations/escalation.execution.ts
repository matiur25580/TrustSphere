export type EscalationTier = { afterMinutes: number; target: "on_call" | "incident_assignee" | "organization_admins"; rotationId?: string | null };
export type RotationMember = { userId: string; position: number };
export type Rotation = { startsAt: Date; intervalMinutes: number; rotationMode: "round_robin" | "fixed_primary"; members: RotationMember[] };

export function dueTierIndexes(tiers: EscalationTier[], reportedAt: Date, now: Date): number[] {
  const elapsedMinutes = Math.floor((now.getTime() - reportedAt.getTime()) / 60_000);
  return tiers.map((tier, index) => ({ tier, index })).filter(({ tier }) => elapsedMinutes >= tier.afterMinutes).map(({ index }) => index);
}

export function selectOnCallMember(rotation: Rotation, now: Date): string | null {
  const members = [...rotation.members].sort((a, b) => a.position - b.position);
  if (members.length === 0) return null;
  if (rotation.rotationMode === "fixed_primary") return members[0].userId;
  const intervalMs = Math.max(1, rotation.intervalMinutes) * 60_000;
  const elapsed = Math.max(0, now.getTime() - rotation.startsAt.getTime());
  const slot = Math.floor(elapsed / intervalMs);
  return members[slot % members.length].userId;
}

export function escalationDedupeKey(organizationId: string, incidentId: string, policyId: string, tierIndex: number): string {
  return [organizationId, incidentId, policyId, tierIndex].join(":");
}
