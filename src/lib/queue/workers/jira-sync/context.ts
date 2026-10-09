import { prisma } from "@/lib/prisma";
import {
  jira as systemJira,
  jiraWith,
  parseJiraDate,
  type JiraClient,
} from "@/lib/jira/client";
import { getProjectPeopleFields } from "@/lib/jira/people-fields";
import { buildProjectPollJql } from "@/lib/jira/jql";
import { upsertJiraCommentsWithNew, upsertJiraIssue } from "@/lib/issues/cache";
import {
  notifyWatchersOfComment,
  notifyWatchersOfIssueChange,
} from "@/lib/issues/notify-watchers";
import { env } from "../../guard";
import {
  claimJiraSyncLease,
  renewJiraSyncLease,
  releaseJiraSyncLease,
  SyncLeaseLostError,
} from "../../jira-sync-lease";
import type { FinalizeRunInput, JiraSyncDependencies } from "./types";

function asIsoString(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function finalizeRun(input: FinalizeRunInput) {
  return prisma.$transaction(async (tx) => {
    const currentCursor = await tx.integrationCursor.findUnique({
      where: { id: input.current.id },
    });
    if (!currentCursor || currentCursor.activeRunToken !== input.runToken) {
      throw new SyncLeaseLostError(
        `Jira sync lease lost for ${input.projectKey}: active token changed`
      );
    }

    let deleted = 0;
    if (
      input.isFullScan &&
      !input.hasErrors &&
      input.exhaustedAllPages &&
      !input.aborted
    ) {
      const result = await tx.issueCache.updateMany({
        where: {
          projectKey: input.projectKey,
          deletedAt: null,
          ...(input.seenKeys.size > 0
            ? { jiraKey: { notIn: [...input.seenKeys] } }
            : {}),
        },
        data: { deletedAt: new Date() },
      });
      deleted = result.count;
    }

    const lastSuccessAt = !input.hasErrors ? new Date() : currentCursor.lastSuccessAt;
    const lastError = input.hasErrors
      ? input.stats.errors.slice(0, 10).join("; ").slice(0, 2000)
      : null;
    const finalStats = {
      ...input.stats,
      deleted,
      lastSuccessAt: asIsoString(lastSuccessAt),
      lastError,
      cursorAdvanced: input.cursorAdvanced,
    };
    const updateResult = await tx.integrationCursor.updateMany({
      where: {
        id: input.current.id,
        activeRunToken: input.runToken,
      },
      data: {
        cursor: input.cursor,
        lastSuccessAt,
        lastErrorAt: input.hasErrors ? new Date() : null,
        lastError,
        stats: finalStats,
        activeRunToken: null,
        activeRunStartedAt: null,
        activeRunExpiresAt: null,
      },
    });
    if (updateResult.count === 0) {
      throw new SyncLeaseLostError(
        `Jira sync lease lost for ${input.projectKey} during finalize commit`
      );
    }

    return {
      deleted,
      lastSuccessAt: asIsoString(lastSuccessAt),
      lastError,
    };
  });
}

export const jiraSyncDependencies: JiraSyncDependencies = {
  now: () => new Date(),
  overlapSeconds: env.jiraSyncOverlapSeconds,
  claimLease: claimJiraSyncLease,
  renewLease: renewJiraSyncLease,
  releaseLease: releaseJiraSyncLease,
  buildJql: buildProjectPollJql,
  loadPeopleFields: getProjectPeopleFields,
  findPreviousIssues: (keys) =>
    prisma.issueCache.findMany({ where: { jiraKey: { in: keys } } }),
  upsertIssue: upsertJiraIssue,
  upsertComments: upsertJiraCommentsWithNew,
  notifyIssue: notifyWatchersOfIssueChange,
  notifyComment: notifyWatchersOfComment,
  parseDate: parseJiraDate,
  saveWorkflowSnapshot: async (projectKey, statuses) => {
    const { upsertProjectWorkflowSnapshot } = await import(
      "@/lib/jira/project-workflow-store"
    );
    return upsertProjectWorkflowSnapshot(projectKey, statuses);
  },
  finalizeRun,
  recordError: async (cursorId, runToken, message, stats) => {
    await prisma.integrationCursor.updateMany({
      where: { id: cursorId, activeRunToken: runToken },
      data: {
        lastErrorAt: new Date(),
        lastError: message,
        stats,
      },
    });
  },
  warn: (message, detail) => console.warn(message, detail),
};

/** Resolve the first stored account that can read the project, then fall back to system auth. */
export async function jiraClientForProject(projectKey: string): Promise<JiraClient> {
  try {
    const { resolveJiraAuthForProject } = await import("@/lib/jira/project-access");
    const { getSystemJiraAuth } = await import("@/lib/jira/client");
    const [resolved, system] = await Promise.all([
      resolveJiraAuthForProject(projectKey),
      getSystemJiraAuth(),
    ]);
    if (
      resolved &&
      (!system || resolved.token !== system.token || resolved.user !== system.user)
    ) {
      return jiraWith(resolved);
    }
  } catch {
    // Discovery must not block a sync that previously used the system client.
  }
  return systemJira;
}
