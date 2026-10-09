import type { JiraComment } from "@/lib/jira/types";
import { JiraSyncAbortedError, SyncLeaseLostError } from "../../jira-sync-lease";
import type {
  JiraSyncClient,
  JiraSyncDependencies,
  JiraSyncPage,
  PersistPageResult,
  ProjectStats,
} from "./types";
import { safeError } from "./types";

export async function persistPage(
  input: {
    jira: JiraSyncClient;
    page: JiraSyncPage;
    stats: ProjectStats;
    seenKeys: Set<string>;
    newestUpdatedAt: Date | null;
    signal?: AbortSignal;
  },
  dependencies: Pick<
    JiraSyncDependencies,
    | "findPreviousIssues"
    | "upsertIssue"
    | "upsertComments"
    | "notifyIssue"
    | "notifyComment"
    | "parseDate"
  >,
  renewAndAssert: () => Promise<void>
): Promise<PersistPageResult> {
  await renewAndAssert();
  const previousRows = await dependencies.findPreviousIssues(
    input.page.issues.map((issue) => issue.key)
  );
  const previousByKey = new Map(previousRows.map((row) => [row.jiraKey, row]));
  let newestUpdatedAt = input.newestUpdatedAt;

  for (const issue of input.page.issues) {
    input.seenKeys.add(issue.key);
    try {
      const previous = previousByKey.get(issue.key) ?? null;
      const { applied, data: currentIssue } = await dependencies.upsertIssue(issue);
      if (applied) {
        if (previous) input.stats.updated++;
        else input.stats.created++;
        await dependencies.notifyIssue(previous, {
          jiraKey: issue.key,
          ...currentIssue,
        }).catch(() => null);
      }

      const issueUpdatedAt = dependencies.parseDate(issue.fields.updated);
      if (issueUpdatedAt && (!newestUpdatedAt || issueUpdatedAt > newestUpdatedAt)) {
        newestUpdatedAt = issueUpdatedAt;
      }

      try {
        const commentData = issue.fields.comment as
          | { total?: number; comments?: JiraComment[] }
          | undefined;
        const availableComments = commentData?.comments ?? [];
        const totalComments = commentData?.total ?? availableComments.length;
        let commentsToSync: JiraComment[] = [];

        if (availableComments.length > 0 && totalComments <= availableComments.length) {
          commentsToSync = availableComments;
        } else if (totalComments > 0) {
          commentsToSync = await input.jira.getComments(
            issue.key,
            ...(input.signal ? [input.signal] : [])
          );
        }

        if (commentsToSync.length > 0) {
          const { synced, newComments } = await dependencies.upsertComments(
            issue.key,
            commentsToSync
          );
          input.stats.comments += synced;
          for (const comment of newComments) {
            await dependencies.notifyComment(
              comment.jiraKey,
              comment.author,
              comment.body,
              comment.id
            ).catch(() => null);
          }
        }
      } catch (error) {
        input.stats.errors.push(`${issue.key} comments: ${safeError(error)}`);
      }
    } catch (error) {
      if (error instanceof SyncLeaseLostError || error instanceof JiraSyncAbortedError) {
        throw error;
      }
      input.stats.errors.push(`${issue.key}: ${safeError(error)}`);
    }
  }

  return { newestUpdatedAt };
}
