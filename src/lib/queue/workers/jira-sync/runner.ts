import { JiraSyncAbortedError, SyncAlreadyRunningError, SyncLeaseLostError } from "../../jira-sync-lease";
import { fetchPage } from "./fetch-page";
import { finalizeSync } from "./finalize-sync";
import { loadCursor } from "./load-cursor";
import { persistPage } from "./persist-page";
import {
  JIRA_SYNC_MAX_PAGES,
  JIRA_SYNC_PAGE_SIZE,
  safeError,
  type JiraSyncClient,
  type JiraSyncDependencies,
  type ProjectStats,
} from "./types";

export async function runJiraSyncPipeline(
  input: {
    projectKey: string;
    full: boolean;
    runToken: string;
    leaseTtlSeconds: number;
    jira: JiraSyncClient;
    signal?: AbortSignal;
  },
  dependencies: JiraSyncDependencies
): Promise<ProjectStats> {
  const loaded = await loadCursor(
    input.projectKey,
    input.full,
    input.runToken,
    input.leaseTtlSeconds,
    dependencies
  );
  const renewAndAssert = async (): Promise<void> => {
    if (input.signal?.aborted) {
      throw new JiraSyncAbortedError(`Jira sync aborted for ${input.projectKey}`);
    }
    const expiresAt = new Date(
      dependencies.now().getTime() + input.leaseTtlSeconds * 1000
    );
    await dependencies.renewLease(input.projectKey, input.runToken, expiresAt);
  };

  let newestUpdatedAt = loaded.validCursor;
  let exhaustedAllPages = false;
  const seenKeys = new Set<string>();

  try {
    const peopleFields = await dependencies.loadPeopleFields(input.projectKey).catch(() => null);
    const extraPeopleFields = peopleFields
      ? Object.values(peopleFields).filter((value): value is string => Boolean(value))
      : [];

    for (let pageNumber = 0; pageNumber < JIRA_SYNC_MAX_PAGES; pageNumber++) {
      const page = await fetchPage(
        input.jira,
        loaded.jql,
        pageNumber,
        JIRA_SYNC_PAGE_SIZE,
        extraPeopleFields,
        input.signal,
        renewAndAssert
      );
      loaded.stats.pages++;
      const persisted = await persistPage(
        {
          jira: input.jira,
          page,
          stats: loaded.stats,
          seenKeys,
          newestUpdatedAt,
          signal: input.signal,
        },
        dependencies,
        renewAndAssert
      );
      newestUpdatedAt = persisted.newestUpdatedAt;

      if (
        page.issues.length < JIRA_SYNC_PAGE_SIZE ||
        (pageNumber + 1) * JIRA_SYNC_PAGE_SIZE >= page.total
      ) {
        exhaustedAllPages = true;
        break;
      }
    }

    if (input.signal?.aborted) {
      throw new JiraSyncAbortedError(`Jira sync aborted for ${input.projectKey}`);
    }
    if (!exhaustedAllPages) {
      throw new Error(
        `Jira sync exceeded ${JIRA_SYNC_MAX_PAGES * JIRA_SYNC_PAGE_SIZE} issues for ${input.projectKey}; cursor was not advanced`
      );
    }

    await finalizeSync(
      {
        projectKey: input.projectKey,
        runToken: input.runToken,
        jira: input.jira,
        loaded,
        newestUpdatedAt,
        exhaustedAllPages,
        seenKeys,
        signal: input.signal,
      },
      dependencies,
      renewAndAssert
    );
    return loaded.stats;
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError || error instanceof SyncLeaseLostError) {
      throw error;
    }
    const message = safeError(error);
    loaded.stats.lastError = message;
    await dependencies.recordError(
      loaded.current.id,
      input.runToken,
      message,
      loaded.stats
    ).catch(() => null);
    throw error;
  } finally {
    await dependencies.releaseLease(input.projectKey, input.runToken).catch(() => null);
  }
}
