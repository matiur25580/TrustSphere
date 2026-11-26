export type FindingSeverity = "low" | "medium" | "high" | "critical";
export type FindingPriority = "p1" | "p2" | "p3" | "p4";

export function classifyFinding(input: { answer: "no" | "partial"; weight: number }): { severity: FindingSeverity; priority: FindingPriority } {
  const weight = Math.max(1, Math.min(5, input.weight));
  if (input.answer === "no" && weight >= 4) return { severity: "critical", priority: "p1" };
  if (input.answer === "no" || (input.answer === "partial" && weight >= 4)) return { severity: "high", priority: "p2" };
  if (input.answer === "partial" && weight >= 3) return { severity: "medium", priority: "p3" };
  return { severity: "low", priority: "p4" };
}
