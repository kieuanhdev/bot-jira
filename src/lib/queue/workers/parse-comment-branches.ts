import { parseCommentsForBranches } from "@/lib/bitbucket/parse-comments";
import { guard, hasJiraConfig } from "../guard";
import type { WorkerLog } from "../guard";

/**
 * Worker: parse Jira comments for Bitbucket PR/branch state.
 *
 * Runs after poll-jira has synced comments. Extracts branch/PR info from
 * comments that Bitbucket auto-posts (e.g. "Merged pull request #123 from
 * EPM-123 to main") and upserts them into BranchInfo. This populates the
 * Branches tab and release gates without needing a Bitbucket API token.
 */
export async function runParseCommentBranches(): Promise<WorkerLog> {
  if (!hasJiraConfig()) return guard(false, "Jira not configured");

  try {
    const stats = await parseCommentsForBranches();
    return {
      ok: true,
      stats: { scanned: stats.scanned, parsed: stats.parsed, upserted: stats.upserted } as unknown as Record<string, number>,
    };
  } catch (e) {
    return { ok: false, errors: [(e as Error).message.slice(0, 500)] };
  }
}
