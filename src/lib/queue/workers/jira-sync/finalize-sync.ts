import type { JiraSyncClient, JiraSyncDependencies, LoadedJiraSync } from "./types";
import { safeError } from "./types";

async function refreshWorkflow(
  projectKey: string,
  jira: JiraSyncClient,
  stats: LoadedJiraSync["stats"],
  dependencies: Pick<JiraSyncDependencies, "saveWorkflowSnapshot" | "warn">,
  renewAndAssert: () => Promise<void>
): Promise<void> {
  try {
    await renewAndAssert();
    const statusesResponse = await jira.getProjectStatuses(projectKey);
    const statuses: Array<{ id: string; name: string; category?: string }> = [];
    const seenIds = new Set<string>();
    for (const item of statusesResponse || []) {
      for (const status of item.statuses || []) {
        if (status.id && !seenIds.has(status.id)) {
          seenIds.add(status.id);
          statuses.push({
            id: status.id,
            name: status.name,
            category: status.statusCategory?.key,
          });
        }
      }
    }
    if (statuses.length > 0) {
      const result = await dependencies.saveWorkflowSnapshot(projectKey, statuses);
      stats.workflowStatusCount = result.statusCount;
    }
  } catch (error) {
    const message = safeError(error);
    stats.workflowRefreshError = message;
    dependencies.warn(
      `[poll-jira] Failed to refresh workflow statuses for ${projectKey}:`,
      message
    );
  }
}

export async function finalizeSync(
  input: {
    projectKey: string;
    runToken: string;
    jira: JiraSyncClient;
    loaded: LoadedJiraSync;
    newestUpdatedAt: Date | null;
    exhaustedAllPages: boolean;
    seenKeys: Set<string>;
    signal?: AbortSignal;
  },
  dependencies: Pick<
    JiraSyncDependencies,
    "saveWorkflowSnapshot" | "finalizeRun" | "warn"
  >,
  renewAndAssert: () => Promise<void>
): Promise<void> {
  const { loaded } = input;
  if (
    loaded.validCursor &&
    input.newestUpdatedAt &&
    input.newestUpdatedAt < loaded.validCursor
  ) {
    input.newestUpdatedAt = loaded.validCursor;
  }

  const hasErrors = loaded.stats.errors.length > 0;
  const cursor = !hasErrors && !input.signal?.aborted
    ? (input.newestUpdatedAt?.toISOString() ?? loaded.current.cursor)
    : loaded.current.cursor;
  const cursorAdvanced =
    !hasErrors &&
    !input.signal?.aborted &&
    Boolean(cursor && cursor !== loaded.current.cursor);
  loaded.stats.cursor = cursor;
  loaded.stats.cursorAdvanced = cursorAdvanced;

  await refreshWorkflow(
    input.projectKey,
    input.jira,
    loaded.stats,
    dependencies,
    renewAndAssert
  );
  await renewAndAssert();

  const finalized = await dependencies.finalizeRun({
    current: loaded.current,
    projectKey: input.projectKey,
    runToken: input.runToken,
    cursor,
    cursorAdvanced,
    isFullScan: loaded.isFullScan,
    hasErrors,
    exhaustedAllPages: input.exhaustedAllPages,
    aborted: Boolean(input.signal?.aborted),
    seenKeys: input.seenKeys,
    stats: loaded.stats,
  });
  loaded.stats.deleted = finalized.deleted;
  loaded.stats.lastSuccessAt = finalized.lastSuccessAt;
  loaded.stats.lastError = finalized.lastError;
}
