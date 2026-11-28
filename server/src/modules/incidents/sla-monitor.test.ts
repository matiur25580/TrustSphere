import assert from "node:assert/strict";
import test from "node:test";
import { findBreachedMilestones } from "./sla-monitor.js";

const now = new Date("2026-11-28T12:00:00.000Z");
const future = new Date("2026-11-28T13:00:00.000Z");
const past = new Date("2026-11-28T11:00:00.000Z");

test("detects each overdue SLA milestone independently", () => {
  assert.deepEqual(findBreachedMilestones({
    responseDueAt: past, containmentDueAt: past, resolutionDueAt: future,
    firstRespondedAt: null, containedAt: null, resolvedAt: null, status: "investigating",
  }, now), ["response", "containment"]);
});

test("does not flag milestones already completed", () => {
  assert.deepEqual(findBreachedMilestones({
    responseDueAt: past, containmentDueAt: past, resolutionDueAt: past,
    firstRespondedAt: past, containedAt: past, resolvedAt: null, status: "recovering",
  }, now), ["resolution"]);
});

test("does not flag resolved or closed incidents", () => {
  for (const status of ["resolved", "closed"]) {
    assert.deepEqual(findBreachedMilestones({
      responseDueAt: past, containmentDueAt: past, resolutionDueAt: past,
      firstRespondedAt: null, containedAt: null, resolvedAt: null, status,
    }, now), []);
  }
});

test("does not treat future deadlines as breached", () => {
  assert.deepEqual(findBreachedMilestones({
    responseDueAt: future, containmentDueAt: future, resolutionDueAt: future,
    firstRespondedAt: null, containedAt: null, resolvedAt: null, status: "reported",
  }, now), []);
});
