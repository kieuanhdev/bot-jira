import type { ImportState, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getJiraIssueUrl } from "@/lib/jira/urls";
import { type SentryScope, resolveRowTargetProject } from "./scope";
import { buildProjectCondition } from "./project-condition";
import { spikeOf } from "./spike";

export { buildProjectCondition };

const STATES: ImportState[] = ["review", "pending", "approved", "created", "rejected", "failed", "ignored"];

export type ListSentryOpts = {
  q?: string;
  sort?: "recent" | "events" | "first" | "hot";
};

export async function listSentryImports(
  stateParam?: string,
  scope: SentryScope = { all: true },
  projectKey?: string,
  opts?: ListSentryOpts
) {
  const requested = (stateParam ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ImportState => (STATES as string[]).includes(s));
  if (requested.includes("review")) requested.push("pending");

  // Non-admins cannot see ignored state
  const effectiveRequested = scope.all ? requested : requested.filter((s) => s !== "ignored");

  // Determine allowed projects filter & where condition
  const projectCondition = buildProjectCondition(scope, projectKey);
  if (projectCondition === null) {
    // Requested project is outside user's scope
    return {
      counts: {},
      requireApproval: env.sentryImportRequireApproval,
      items: [],
    };
  }

  const stateCondition: Prisma.SentryIssueImportedWhereInput | undefined = effectiveRequested.length > 0
    ? { state: { in: effectiveRequested } }
    : scope.all
      ? undefined
      : { state: { not: "ignored" } };

  const qClean = opts?.q?.trim();
  const searchCondition: Prisma.SentryIssueImportedWhereInput | undefined = qClean
    ? {
        OR: [
          { title: { contains: qClean, mode: "insensitive" } },
          { shortId: { contains: qClean, mode: "insensitive" } },
        ],
      }
    : undefined;

  const conditions: Prisma.SentryIssueImportedWhereInput[] = [];
  if (stateCondition) conditions.push(stateCondition);
  if (projectCondition) conditions.push(projectCondition);
  if (searchCondition) conditions.push(searchCondition);

  const whereClause: Prisma.SentryIssueImportedWhereInput | undefined =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : { AND: conditions };

  // GroupBy counts must also respect the scope & project filter
  const groupWhere = projectCondition;

  const orderBy: Prisma.SentryIssueImportedOrderByWithRelationInput[] =
    opts?.sort === "events"
      ? [{ eventCount: "desc" }, { createdAt: "desc" }]
      : opts?.sort === "first"
        ? [{ firstSeen: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
        : opts?.sort === "hot"
          ? [{ eventCount: "desc" }, { lastSeen: { sort: "desc", nulls: "last" } }]
          : [{ lastSeen: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];

  const [items, grouped] = await Promise.all([
    effectiveRequested.length === 0 && requested.length > 0
      ? Promise.resolve([])
      : prisma.sentryIssueImported.findMany({
          where: whereClause,
          orderBy,
          take: qClean || opts?.sort === "hot" ? 500 : 200,
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

  const mappedItems = items.map((r) => {
    const spike = spikeOf({
      eventCount: r.eventCount,
      countBaseline: r.countBaseline,
      countBaselineAt: r.countBaselineAt,
      firstSeen: r.firstSeen,
    });
    return {
      id: r.id,
      sentryProject: r.sentryProject,
      sentryIssueId: r.sentryIssueId,
      shortId: r.shortId,
      title: r.title,
      level: r.level,
      permalinkUrl: r.permalinkUrl,
      eventCount: r.eventCount,
      countBaseline: r.countBaseline,
      countBaselineAt: r.countBaselineAt,
      countDelta24h: spike.delta,
      isHot: spike.hot,
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
    };
  });

  if (opts?.sort === "hot") {
    mappedItems.sort((a, b) => {
      const hotA = Boolean(a.isHot);
      const hotB = Boolean(b.isHot);
      if (hotA !== hotB) return hotA ? -1 : 1;
      const deltaDiff = (b.countDelta24h ?? 0) - (a.countDelta24h ?? 0);
      if (deltaDiff !== 0) return deltaDiff;
      return (b.eventCount ?? 0) - (a.eventCount ?? 0);
    });
  }

  const result = {
    counts,
    requireApproval: env.sentryImportRequireApproval,
    items: mappedItems,
  };

  return JSON.parse(JSON.stringify(result));
}
