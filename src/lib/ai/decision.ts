import { prisma } from "@/lib/prisma";
import { jiraWith } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { refreshJiraIssueCache } from "@/lib/issues/cache";

export type EstimateDecision = "accepted" | "edited" | "rejected";

export type ReviewResult =
  | { ok: true; decision: EstimateDecision; finalPoints: number | null; jiraWritten: boolean }
  | { ok: false; error: string; status: number };

/**
 * M7-03 — Record a human review of an AI estimate and, only when the human
 * accepts (or edits and accepts) it, push the final points to Jira.
 *
 * - "accepted": final points == AI suggested points.
 * - "edited":   final points == user-chosen points (different from AI).
 * - "rejected": nothing is written to Jira.
 *
 * The AI value and the final human value are stored separately (AiEstimateDecision)
 * so metrics can compare them (M7-04).
 */
export async function recordEstimateDecision(opts: {
  key: string;
  decision: EstimateDecision;
  finalPoints?: number | null;
  userId: string;
  auth: ReturnType<typeof userJiraAuth>;
}): Promise<ReviewResult> {
  const { key, decision, finalPoints, userId, auth } = opts;

  const score = await prisma.aiScore.findUnique({ where: { jiraKey: key } });
  if (!score) {
    return { ok: false, error: "No AI estimate to review for this task", status: 404 };
  }

  let pointsToWrite: number | null = null;
  if (decision === "accepted") pointsToWrite = score.points;
  else if (decision === "edited") {
    if (finalPoints == null || !Number.isInteger(finalPoints) || finalPoints <= 0) {
      return { ok: false, error: "Edited points must be a positive integer", status: 400 };
    }
    pointsToWrite = finalPoints;
  } else if (decision === "rejected") {
    pointsToWrite = null;
  } else {
    return { ok: false, error: "Invalid decision", status: 400 };
  }

  let jiraWritten = false;
  if (decision !== "rejected") {
    if (!auth) {
      return { ok: false, error: "Jira credentials required", status: 428 };
    }
    const client = jiraWith(auth);
    try {
      await client.updateIssue(key, { points: pointsToWrite });
      await refreshJiraIssueCache(client, key);
      jiraWritten = true;
    } catch (e) {
      return {
        ok: false,
        error: `Jira update failed: ${(e as Error).message}`,
        status: 502,
      };
    }
  }

  await prisma.aiEstimateDecision.create({
    data: {
      jiraKey: key,
      scoreId: score.id,
      decision,
      finalPoints: pointsToWrite,
      decidedById: userId,
    },
  });

  return { ok: true, decision, finalPoints: pointsToWrite, jiraWritten };
}
