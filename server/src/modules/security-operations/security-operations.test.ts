import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

function eventHash(input: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

test("custody event hashes are deterministic and bind the previous event hash", () => {
  const base = {
    organizationId: "org-a", incidentId: "incident-a", evidenceId: "evidence-a", sequence: 1,
    actorId: "user-a", action: "collected", fromCustodian: "", toCustodian: "analyst",
    location: "SOC", notes: "Collected from endpoint", evidenceSha256: "a".repeat(64),
    previousHash: "0".repeat(64), occurredAt: "2026-11-28T00:00:00.000Z",
  };
  const first = eventHash(base);
  assert.equal(first, eventHash(base));
  assert.notEqual(first, eventHash({ ...base, notes: "Different custody note" }));
  assert.notEqual(first, eventHash({ ...base, previousHash: "b".repeat(64) }));
});

test("custody ledger hashes change when sequence, actor or evidence changes", () => {
  const base = { organizationId: "org-a", incidentId: "incident-a", evidenceId: "evidence-a", sequence: 1, actorId: "user-a", action: "accessed", fromCustodian: "", toCustodian: "", location: "", notes: "", evidenceSha256: "c".repeat(64), previousHash: "0".repeat(64), occurredAt: "2026-11-28T00:00:00.000Z" };
  const hash = eventHash(base);
  assert.notEqual(hash, eventHash({ ...base, sequence: 2 }));
  assert.notEqual(hash, eventHash({ ...base, actorId: "user-b" }));
  assert.notEqual(hash, eventHash({ ...base, evidenceSha256: "d".repeat(64) }));
});
