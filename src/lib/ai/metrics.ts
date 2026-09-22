import { prisma } from "@/lib/prisma";
import { pointScale } from "@/lib/env";

/**
 * M7-04 — Metrics on AI estimation quality, computed from AiScore +
 * AiEstimateDecision. All figures are read-only aggregates; no task content
 * leaves the system (the DoD privacy rule).
 */
export async function estimateMetrics() {
  const scale = [...(pointScale as number[])].sort((a, b) => a - b);
  const decisions = await prisma.aiEstimateDecision.findMany({
    select: {
      decision: true,
      finalPoints: true,
      score: { select: { points: true, confidence: true, issue: { select: { type: true } } } },
    },
  });

  const aiPoints = decisions.map((d) => d.score.points);
  const decided = decisions.filter((d) => d.finalPoints != null);
  const accepted = decisions.filter((d) => d.decision === "accepted");
  const rejected = decisions.filter((d) => d.decision === "rejected");
  const edited = decisions.filter((d) => d.decision === "edited");

  const acceptedRate = decisions.length > 0 ? accepted.length / decisions.length : 0;

  // Deviation between AI suggestion and the final (human) points.
  const deviations = decided.map((d) => Math.abs(d.score.points - (d.finalPoints as number)));
  const meanAbsoluteDeviation =
    deviations.length > 0
      ? deviations.reduce((a, b) => a + b, 0) / deviations.length
      : 0;

  // Accuracy: how often the final points matched the AI suggestion exactly.
  const exactMatches = decided.filter((d) => d.finalPoints === d.score.points).length;
  const accuracy = decided.length > 0 ? exactMatches / decided.length : 0;

  // Average confidence overall.
  const confs = decisions.map((d) => d.score.confidence).filter((c): c is number => c != null);
  const avgConfidence = confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : null;

  // Average confidence grouped by issue type (from all scores, not just decided).
  const typeRows = await prisma.aiScore.findMany({
    where: { confidence: { not: null } },
    select: { confidence: true, issue: { select: { type: true } } },
  });
  const byType: Record<string, { count: number; avgConfidence: number }> = {};
  for (const row of typeRows) {
    const t = row.issue.type || "unknown";
    if (!byType[t]) byType[t] = { count: 0, avgConfidence: 0 };
    byType[t].count += 1;
    byType[t].avgConfidence += (row.confidence as number);
  }
  for (const t of Object.keys(byType)) byType[t].avgConfidence /= byType[t].count;

  return {
    totals: {
      estimated: aiPoints.length,
      decided: decided.length,
      accepted: accepted.length,
      edited: edited.length,
      rejected: rejected.length,
    },
    acceptedRate: round(acceptedRate),
    meanAbsoluteDeviation: round(meanAbsoluteDeviation),
    accuracy: round(accuracy),
    avgConfidence: avgConfidence == null ? null : round(avgConfidence),
    confidenceByIssueType: byType,
    pointScale: scale,
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
