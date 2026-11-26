import assert from "node:assert/strict";
import test from "node:test";
import { riskBand, scoreResponses } from "./assessment.scoring.js";

const questions = [
  { id: "a", category: "Identity", weight: 2 },
  { id: "b", category: "Identity", weight: 2 },
  { id: "c", category: "Data", weight: 4 },
];

test("maps weighted yes, partial and no answers to an explainable risk score", () => {
  const result = scoreResponses([
    { questionId: "a", answer: "yes" },
    { questionId: "b", answer: "partial" },
    { questionId: "c", answer: "no" },
  ], questions);
  assert.equal(result.score, 63);
  assert.equal(result.band, "high");
  assert.deepEqual(result.breakdown.map(item => [item.category, item.score]), [["Identity", 25], ["Data", 100]]);
});

test("excludes not-applicable responses from the denominator", () => {
  const result = scoreResponses([
    { questionId: "a", answer: "no" },
    { questionId: "b", answer: "not_applicable" },
  ], questions);
  assert.equal(result.score, 100);
  assert.equal(result.breakdown[0]?.answeredWeight, 2);
  assert.equal(result.breakdown[0]?.totalWeight, 4);
});

test("returns zero when there are no scored responses", () => {
  assert.equal(scoreResponses([], questions).score, 0);
});

test("classifies score boundaries deterministically", () => {
  assert.equal(riskBand(34), "low");
  assert.equal(riskBand(35), "medium");
  assert.equal(riskBand(60), "high");
  assert.equal(riskBand(80), "critical");
});
