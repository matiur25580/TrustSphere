export type AssessmentQuestionWeight = { id: string; category: string; weight: number };
export type AssessmentAnswer = { questionId: string; answer: string };
export type CategoryScore = { category: string; score: number; answeredWeight: number; totalWeight: number };

export function riskBand(score: number): "low" | "medium" | "high" | "critical" {
  return score >= 80 ? "critical" : score >= 60 ? "high" : score >= 35 ? "medium" : "low";
}

export function scoreResponses(responses: AssessmentAnswer[], questions: AssessmentQuestionWeight[]) {
  const values: Record<string, number> = { yes: 0, partial: 50, no: 100 };
  const responseMap = new Map(responses.map(response => [response.questionId, response.answer]));
  const categoryMap = new Map<string, { weighted: number; weight: number }>();
  for (const question of questions) {
    const answer = responseMap.get(question.id);
    if (!answer || answer === "not_applicable") continue;
    const current = categoryMap.get(question.category) ?? { weighted: 0, weight: 0 };
    current.weighted += values[answer] * question.weight;
    current.weight += question.weight;
    categoryMap.set(question.category, current);
  }
  const total = [...categoryMap.values()].reduce((sum, item) => sum + item.weight, 0);
  const weighted = [...categoryMap.values()].reduce((sum, item) => sum + item.weighted, 0);
  const score = total ? Math.round(weighted / total) : 0;
  const breakdown: CategoryScore[] = [...categoryMap.entries()].map(([category, item]) => ({
    category,
    score: Math.round(item.weighted / item.weight),
    answeredWeight: item.weight,
    totalWeight: questions.filter(question => question.category === category).reduce((sum, question) => sum + question.weight, 0),
  }));
  return { score, band: riskBand(score), breakdown };
}
