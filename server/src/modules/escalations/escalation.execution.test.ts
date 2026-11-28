import assert from "node:assert/strict";
import test from "node:test";
import { dueTierIndexes, escalationDedupeKey, selectOnCallMember } from "./escalation.execution.js";

test("only returns escalation tiers whose elapsed threshold has passed", () => {
  const tiers = [{ afterMinutes: 0, target: "incident_assignee" as const }, { afterMinutes: 10, target: "on_call" as const }, { afterMinutes: 30, target: "organization_admins" as const }];
  assert.deepEqual(dueTierIndexes(tiers, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:12:00Z")), [0, 1]);
});

test("round robin selection is deterministic and advances by configured interval", () => {
  const rotation = { startsAt: new Date("2026-01-01T00:00:00Z"), intervalMinutes: 60, rotationMode: "round_robin" as const, members: [{ userId: "second", position: 1 }, { userId: "first", position: 0 }] };
  assert.equal(selectOnCallMember(rotation, new Date("2026-01-01T00:00:00Z")), "first");
  assert.equal(selectOnCallMember(rotation, new Date("2026-01-01T01:00:00Z")), "second");
  assert.equal(selectOnCallMember(rotation, new Date("2026-01-01T02:00:00Z")), "first");
});

test("fixed primary always selects the lowest-position member", () => {
  const rotation = { startsAt: new Date("2026-01-01T00:00:00Z"), intervalMinutes: 60, rotationMode: "fixed_primary" as const, members: [{ userId: "backup", position: 1 }, { userId: "primary", position: 0 }] };
  assert.equal(selectOnCallMember(rotation, new Date("2026-01-02T00:00:00Z")), "primary");
});

test("dedupe key uniquely scopes an execution to tenant, incident, policy and tier", () => {
  assert.equal(escalationDedupeKey("org", "incident", "policy", 2), "org:incident:policy:2");
  assert.notEqual(escalationDedupeKey("org-a", "incident", "policy", 2), escalationDedupeKey("org-b", "incident", "policy", 2));
});
