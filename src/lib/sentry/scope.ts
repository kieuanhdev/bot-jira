import type { SentryIssueImported } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveUserProjectScope } from "@/lib/reports/scope";
import { env, jiraProjectList, parseSentryMappings, resolveJiraProject } from "@/lib/env";

export type SentryScope = { all: true } | { all: false; projects: string[] };

export class SentryRowAccessError extends Error {
  readonly status = 404;
  constructor(message = "Không tìm thấy lỗi Sentry") {
    super(message);
    this.name = "SentryRowAccessError";
  }
}

/**
 * Resolve project scope for Sentry viewing and operations.
 * - Admin: sees all projects (`{ all: true }`)
 * - Regular user: restricted to their active allowed projects (`{ all: false, projects: [...] }`)
 */
export async function sentryScopeFor(session: {
  user?: { id?: string; role?: string };
} | null): Promise<SentryScope> {
  if (!session?.user?.id) {
    return { all: false, projects: [] };
  }
  if (session.user.role === "admin") {
    return { all: true };
  }
  const userScope = await resolveUserProjectScope(session.user.id, session.user.role);
  return { all: false, projects: userScope.allowedProjects };
}

/**
 * Computes the effective Jira target project for a Sentry row, resolving mappings
 * or fallback for rows where `targetProject` is null.
 */
export function resolveRowTargetProject(row: {
  targetProject: string | null;
  sentryProject: string;
}): string | null {
  if (row.targetProject) return row.targetProject;
  const mappings = parseSentryMappings(env.sentryProjectMappings);
  const fallbackProject = jiraProjectList[0] ?? null;
  return resolveJiraProject(row.sentryProject, mappings, fallbackProject);
}

/**
 * Checks whether a row is accessible given a SentryScope.
 */
export function hasSentryRowAccess(
  row: { targetProject: string | null; sentryProject: string },
  scope: SentryScope
): boolean {
  if (scope.all) return true;
  const target = resolveRowTargetProject(row);
  return Boolean(target && scope.projects.includes(target));
}

/**
 * Validates that the requested Sentry row exists and is within the user's project scope.
 * Throws `SentryRowAccessError` (404) if not found or out of scope, preventing ID enumeration.
 */
export async function assertSentryRowAccess<T = SentryIssueImported>(
  rowId: string,
  scope: SentryScope,
  client: Pick<typeof prisma, "sentryIssueImported"> = prisma
): Promise<T> {
  const row = await client.sentryIssueImported.findUnique({
    where: { id: rowId },
  });
  if (!row) {
    throw new SentryRowAccessError();
  }
  if (!hasSentryRowAccess(row, scope)) {
    throw new SentryRowAccessError();
  }
  return row as T;
}
