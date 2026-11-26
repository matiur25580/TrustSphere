import test from "node:test";
import assert from "node:assert/strict";
import { classifyFinding } from "./finding.scoring.js";

test("critical control failure creates a P1 finding", () => {
  assert.deepEqual(classifyFinding({ answer: "no", weight: 4 }), { severity: "critical", priority: "p1" });
});
test("ordinary control failure creates a high P2 finding", () => {
  assert.deepEqual(classifyFinding({ answer: "no", weight: 2 }), { severity: "high", priority: "p2" });
});
test("partial high-weight response is high priority", () => {
  assert.deepEqual(classifyFinding({ answer: "partial", weight: 4 }), { severity: "high", priority: "p2" });
});
test("partial medium-weight response is medium priority", () => {
  assert.deepEqual(classifyFinding({ answer: "partial", weight: 3 }), { severity: "medium", priority: "p3" });
});
test("low-weight partial response is low priority", () => {
  assert.deepEqual(classifyFinding({ answer: "partial", weight: 1 }), { severity: "low", priority: "p4" });
});
test("classification clamps out-of-range weights", () => {
  assert.deepEqual(classifyFinding({ answer: "no", weight: 99 }), { severity: "critical", priority: "p1" });
});
