import assert from "node:assert/strict";
import test from "node:test";
import { calculateIncidentSla, incidentSlaMinutes } from "./incident-sla.js";

test("P1 incidents receive the shortest response, containment and resolution targets", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  const result = calculateIncidentSla("p1", start);
  assert.equal(result.responseDueAt.toISOString(), "2026-01-01T00:15:00.000Z");
  assert.equal(result.containmentDueAt.toISOString(), "2026-01-01T01:00:00.000Z");
  assert.equal(result.resolutionDueAt.toISOString(), "2026-01-01T04:00:00.000Z");
});

test("SLA targets are ordered and become less urgent by severity", () => {
  for (const severity of ["p1", "p2", "p3", "p4"] as const) {
    const policy = incidentSlaMinutes[severity];
    assert.ok(policy.response < policy.containment);
    assert.ok(policy.containment < policy.resolution);
  }
  assert.ok(incidentSlaMinutes.p1.response < incidentSlaMinutes.p2.response);
  assert.ok(incidentSlaMinutes.p2.response < incidentSlaMinutes.p3.response);
  assert.ok(incidentSlaMinutes.p3.response < incidentSlaMinutes.p4.response);
});

test("SLA calculation does not mutate the supplied start date", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  calculateIncidentSla("p2", start);
  assert.equal(start.toISOString(), "2026-01-01T00:00:00.000Z");
});
