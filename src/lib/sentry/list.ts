import type { ImportState, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getJiraIssueUrl } from "@/lib/jira/urls";
import { type SentryScope, resolveRowTargetProject } from "./scope";
import { buildProjectCondition } from "./project-condition";
import { spikeOf } from "./spike";

export { buildProjectCondition };

const STATES: ImportState[] = ["review", "pending", "approved", "created", "rejected", "failed", "ignored"];

export const SENTRY_SINCE_WINDOWS_MS = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
} as const;

export type ListSentryOpts = {
  q?: string;
  sort?: "recent" | "events" | "first" | "hot";
  release?: string;
  environment?: string;
  level?: string;
  /** Only issues last seen within this window. */
  since?: keyof typeof SENTRY_SINCE_WINDOWS_MS;
};

const EMPTY_FACETS = { releases: [], environments: [] } as {
  releases: { value: string; count: number }[];
  environments: { value: string; count: number }[];
};
const MAX_FACET_OPTIONS = 30;

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
      facets: EMPTY_FACETS,
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

  const filterConditions: Prisma.SentryIssueImportedWhereInput[] = [];
  if (opts?.release) filterConditions.push({ release: opts.release });
  if (opts?.environment) filterConditions.push({ environment: opts.environment });
  if (opts?.level) filterConditions.push({ level: opts.level });
  if (opts?.since && SENTRY_SINCE_WINDOWS_MS[opts.since]) {
    filterConditions.push({ lastSeen: { gte: new Date(Date.now() - SENTRY_SINCE_WINDOWS_MS[opts.since]) } });
  }

  const conditions: Prisma.SentryIssueImportedWhereInput[] = [];
  if (stateCondition) conditions.push(stateCondition);
  if (projectCondition) conditions.push(projectCondition);
  if (searchCondition) conditions.push(searchCondition);
  conditions.push(...filterConditions);

  // Facet options reflect the visible tab and project, not the other filters,
  // so picking a release never hides the other releases.
  const facetConditions = [stateCondition, projectCondition].filter(
    (c): c is Prisma.SentryIssueImportedWhereInput => Boolean(c)
  );
  const facetWhere: Prisma.SentryIssueImportedWhereInput = facetConditions.length > 0 ? { AND: facetConditions } : {};
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

  const [items, grouped, releaseGroups, environmentGroups] = await Promise.all([
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
    prisma.sentryIssueImported.groupBy({
      by: ["release"],
      where: { AND: [facetWhere, { release: { not: null } }] },
      _count: { _all: true },
      orderBy: { _count: { release: "desc" } },
      take: MAX_FACET_OPTIONS,
    }),
    prisma.sentryIssueImported.groupBy({
      by: ["environment"],
      where: { AND: [facetWhere, { environment: { not: null } }] },
      _count: { _all: true },
      orderBy: { _count: { environment: "desc" } },
      take: MAX_FACET_OPTIONS,
    }),
  ]);

  const facets = {
    releases: (releaseGroups ?? [])
      .filter((g) => typeof g.release === "string" && g.release)
      .map((g) => ({ value: g.release as string, count: g._count._all })),
    environments: (environmentGroups ?? [])
      .filter((g) => typeof g.environment === "string" && g.environment)
      .map((g) => ({ value: g.environment as string, count: g._count._all })),
  };

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
      culprit: r.culprit,
      userCount: r.userCount,
      release: r.release,
      environment: r.environment,
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
    facets,
  };

  return JSON.parse(JSON.stringify(result));
}
