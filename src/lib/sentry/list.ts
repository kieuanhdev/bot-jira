import type { ImportState, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env, jiraProjectList, parseSentryMappings } from "@/lib/env";
import { getJiraIssueUrl } from "@/lib/jira/urls";
import { type SentryScope, resolveRowTargetProject } from "./scope";

const STATES: ImportState[] = ["review", "pending", "approved", "created", "rejected", "failed", "ignored"];

export async function listSentryImports(
  stateParam?: string,
  scope: SentryScope = { all: true },
  projectKey?: string
) {
  const requested = (stateParam ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ImportState => (STATES as string[]).includes(s));
  if (requested.includes("review")) requested.push("pending");

  // Non-admins cannot see ignored state
  const effectiveRequested = scope.all ? requested : requested.filter((s) => s !== "ignored");

  // Determine allowed projects filter
  let targetProjects: string[] | null = null;
  const normalizedKey = projectKey?.trim().toUpperCase();

  if (normalizedKey && normalizedKey !== "ALL") {
    if (!scope.all && !scope.projects.includes(normalizedKey)) {
      // Requested project is outside user's scope
      return {
        counts: {},
        requireApproval: env.sentryImportRequireApproval,
        items: [],
      };
    }
    targetProjects = [normalizedKey];
  } else if (!scope.all) {
    targetProjects = scope.projects;
  }

  // Construct project where condition (handling rows with targetProject = null)
  let projectCondition: Prisma.SentryIssueImportedWhereInput | undefined = undefined;
  if (targetProjects !== null) {
    const mappings = parseSentryMappings(env.sentryProjectMappings);
    const fallback = jiraProjectList[0] ?? null;
    const mappedSlugs = mappings
      .filter((m) => targetProjects!.includes(m.jiraProject))
      .map((m) => m.sentryProject);
    const fallbackMatches = Boolean(fallback && targetProjects.includes(fallback));

    const nullTargetCondition: Prisma.SentryIssueImportedWhereInput | null = mappings.length > 0
      ? (mappedSlugs.length > 0 ? { targetProject: null, sentryProject: { in: mappedSlugs } } : null)
      : (fallbackMatches ? { targetProject: null } : null);

    projectCondition = nullTargetCondition
      ? {
          OR: [
            { targetProject: { in: targetProjects } },
            nullTargetCondition,
          ],
        }
      : { targetProject: { in: targetProjects } };
  }

  const stateCondition: Prisma.SentryIssueImportedWhereInput | undefined = effectiveRequested.length > 0
    ? { state: { in: effectiveRequested } }
    : scope.all
      ? undefined
      : { state: { not: "ignored" } };

  const whereClause: Prisma.SentryIssueImportedWhereInput | undefined = projectCondition && stateCondition
    ? { AND: [stateCondition, projectCondition] }
    : stateCondition ?? projectCondition;

  // GroupBy counts must also respect the scope & project filter
  const groupWhere = projectCondition;

  const [items, grouped] = await Promise.all([
    effectiveRequested.length === 0 && requested.length > 0
      ? Promise.resolve([])
      : prisma.sentryIssueImported.findMany({
          where: whereClause,
          orderBy: [{ lastSeen: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
          take: 200,
        }),
    prisma.sentryIssueImported.groupBy({
      by: ["state"],
      where: groupWhere,
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const g of grouped) {
    if (!scope.all && g.state === "ignored") continue;
    const key = g.state === "pending" ? "review" : g.state;
    counts[key] = (counts[key] ?? 0) + g._count._all;
  }

  const result = {
    counts,
    requireApproval: env.sentryImportRequireApproval,
    items: items.map((r) => ({
      id: r.id,
      sentryProject: r.sentryProject,
      sentryIssueId: r.sentryIssueId,
      shortId: r.shortId,
      title: r.title,
      level: r.level,
      permalinkUrl: r.permalinkUrl,
      eventCount: r.eventCount,
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      targetProject: r.targetProject ?? resolveRowTargetProject(r),
      draftSummary: r.draftSummary,
      draftDescription: r.draftDescription,
      jiraKey: r.jiraKey,
      jiraUrl: getJiraIssueUrl(env.jiraBaseUrl, r.jiraKey),
      state: r.state === "pending" ? "review" : r.state,
      attemptCount: r.attemptCount,
      lastError: r.lastError,
      lastAttemptAt: r.lastAttemptAt,
      importedAt: r.importedAt,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    })),
  };

  return JSON.parse(JSON.stringify(result));
}
