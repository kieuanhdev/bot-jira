import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith, JiraRequestError } from "@/lib/jira/client";
import { validateBoardForProject, fetchBoardMembershipFromJira } from "@/lib/jira/board-membership";
import {
  saveBoardMembershipSnapshot,
  markMembershipForbidden,
  markMembershipFailed,
  invalidateBoardMembership,
  markMembershipRefreshing,
} from "@/lib/jira/board-membership-store";
import { env } from "@/lib/env";
import type { WorkerLog } from "../guard";

export type RefreshBoardMembershipJobData = {
  userId: string;
  projectKey: string;
  boardId: number;
  priority?: "high" | "normal";
  force?: boolean;
  reason?: "preference_saved" | "jira_sync_completed" | "scheduled" | "manual_retry" | string;
};

export async function runRefreshBoardMembership(
  data: RefreshBoardMembershipJobData
): Promise<WorkerLog> {
  const startedAt = Date.now();
  const { userId, boardId } = data;
  const projectKey = (data.projectKey ?? "").trim().toUpperCase();
  const reason = data.reason ?? "preference_saved";

  if (!userId || !projectKey || !boardId || boardId <= 0) {
    return {
      ok: false,
      reason: `Invalid job parameters: userId=${userId}, projectKey=${projectKey}, boardId=${boardId}`,
    };
  }

  // Mark as refreshing in DB
  await markMembershipRefreshing(userId, projectKey, boardId, { reason }).catch(() => {});

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      jiraUsername: true,
    },
  });

  if (!user) {
    return { ok: false, reason: `User ${userId} not found` };
  }

  const auth = userJiraAuth(user);
  if (!auth) {
    await markMembershipForbidden(userId, projectKey, boardId, "jira_credentials_required");
    return { ok: false, reason: `User ${userId} lacks Jira credentials` };
  }

  const client = jiraWith(auth);

  try {
    // 1. Verify board belongs to project
    await validateBoardForProject(client, boardId, projectKey);

    // 2. Fetch issues and backlog
    const raw = await fetchBoardMembershipFromJira(client, boardId, env.jiraBoardMembershipMaxIssues);

    // 3. Atomically commit new snapshot generation
    await saveBoardMembershipSnapshot({
      userId,
      projectKey,
      boardId,
      boardKeys: raw.boardKeys,
      backlogKeys: raw.backlogKeys,
      truncated: raw.truncated,
    });

    const durationMs = Date.now() - startedAt;
    console.info(
      JSON.stringify({
        event: "board_membership_refresh",
        projectKey,
        boardId,
        issuePages: raw.issuePages,
        backlogPages: raw.backlogPages,
        itemCount: raw.allKeys.length,
        backlogCount: raw.backlogKeys.length,
        truncated: raw.truncated,
        durationMs,
        outcome: "success",
      })
    );

    return {
      ok: true,
      stats: {
        itemCount: raw.allKeys.length,
        backlogCount: raw.backlogKeys.length,
        issuePages: raw.issuePages,
        backlogPages: raw.backlogPages,
        truncated: raw.truncated,
        durationMs,
      },
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startedAt;
    let outcome = "failed";
    let errorCode = "membership_refresh_failed";

    if (err instanceof JiraRequestError) {
      if (err.status === 401 || err.status === 403) {
        outcome = "forbidden";
        errorCode = "board_forbidden";
        await markMembershipForbidden(userId, projectKey, boardId, errorCode);
      } else if (err.status === 404) {
        outcome = "not_found";
        errorCode = "board_not_found";
        await invalidateBoardMembership(userId, projectKey, boardId);
      } else if (err.status === 409) {
        outcome = "project_mismatch";
        errorCode = "board_project_mismatch";
        await invalidateBoardMembership(userId, projectKey, boardId);
      } else {
        await markMembershipFailed(userId, projectKey, boardId, errorCode);
      }
    } else {
      await markMembershipFailed(userId, projectKey, boardId, errorCode);
    }

    console.warn(
      JSON.stringify({
        event: "board_membership_refresh",
        projectKey,
        boardId,
        durationMs,
        outcome,
        errorCode,
        error: (err as Error).message,
      })
    );

    return {
      ok: false,
      reason: (err as Error).message || errorCode,
      errors: [(err as Error).message],
    };
  }
}
