import type { JiraSyncDependencies, LoadedJiraSync } from "./types";

export async function loadCursor(
  projectKey: string,
  full: boolean,
  runToken: string,
  leaseTtlSeconds: number,
  dependencies: Pick<
    JiraSyncDependencies,
    "now" | "claimLease" | "buildJql" | "overlapSeconds"
  >
): Promise<LoadedJiraSync> {
  const expiresAt = new Date(dependencies.now().getTime() + leaseTtlSeconds * 1000);
  const current = await dependencies.claimLease(projectKey, runToken, expiresAt);
  const parsedCursor = current.cursor ? new Date(current.cursor) : null;
  const validCursor = parsedCursor && !Number.isNaN(parsedCursor.getTime()) ? parsedCursor : null;
  const since = !full && validCursor
    ? new Date(validCursor.getTime() - dependencies.overlapSeconds * 1000)
    : undefined;

  return {
    current,
    validCursor,
    jql: dependencies.buildJql(projectKey, since),
    isFullScan: full || !validCursor,
    stats: {
      projectKey,
      created: 0,
      updated: 0,
      comments: 0,
      deleted: 0,
      pages: 0,
      cursor: current.cursor,
      errors: [],
      cursorAdvanced: false,
    },
  };
}
