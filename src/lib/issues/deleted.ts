import { prisma } from "@/lib/prisma";
import { JiraRequestError } from "@/lib/jira/errors";

/** Jira answers 404 for issues that were deleted (or are no longer visible). */
export function isJiraNotFound(error: unknown): boolean {
  return error instanceof JiraRequestError && error.status === 404;
}

/** Soft-delete cached issues that no longer exist in Jira. Returns how many rows changed. */
export async function markIssuesDeleted(jiraKeys: string[]): Promise<number> {
  if (jiraKeys.length === 0) return 0;
  const result = await prisma.issueCache.updateMany({
    where: { jiraKey: { in: jiraKeys }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count;
}
