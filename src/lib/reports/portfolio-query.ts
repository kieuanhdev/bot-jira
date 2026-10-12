import { listActiveProjects, normalizeProjectKey, type ProjectCatalogItem } from "@/lib/jira/project-catalog";
import type {
  ProjectReportSummary,
  ProjectPortfolioResponse,
  ReportUnit,
  HealthStatus,
} from "./types";
import { getReportFreshness } from "./freshness";
import { resolveReportPeriod, getPeriodDisplayLabel } from "./period";
import {
  resolveScopedProjectKeys,
  fetchBatchReferenceReleases,
  fetchBatchPortfolioIssues,
} from "./query-primitives";
import {
  calculatePortfolioProjectSummary,
  calculatePortfolioRollup,
} from "./portfolio-metrics";

export interface PortfolioQueryParams {
  allowedProjects: string[];
  filterProjects?: string[];
  filterHealth?: HealthStatus[];
  unit?: ReportUnit;
  period?: string | null;
  from?: string | null;
  to?: string | null;
  timezone?: string | null;
  catalog?: ProjectCatalogItem[];
}

export async function getProjectPortfolio(
  params: PortfolioQueryParams
): Promise<ProjectPortfolioResponse> {
  const now = new Date();

  // Intersect allowedProjects with requested filterProjects
  const projectKeys = resolveScopedProjectKeys(params.allowedProjects, params.filterProjects);

  // Resolve period
  const { period } = resolveReportPeriod({
    period: params.period,
    from: params.from,
    to: params.to,
    timezone: params.timezone,
    now,
  });
  const periodLabel = getPeriodDisplayLabel(period);

  // Parallel batch queries for catalog, freshness, reference releases, and issues
  const [activeCatalog, freshness, releaseMap, issuesMap] = await Promise.all([
    params.catalog ? Promise.resolve(params.catalog) : listActiveProjects(),
    getReportFreshness(),
    fetchBatchReferenceReleases(projectKeys),
    fetchBatchPortfolioIssues(projectKeys),
  ]);

  const catalogMap = new Map(activeCatalog.map((p) => [normalizeProjectKey(p.key), p.name]));

  const summaries: ProjectReportSummary[] = [];

  for (const projectKey of projectKeys) {
    const normalizedKey = normalizeProjectKey(projectKey);
    const projectName = catalogMap.get(normalizedKey) || projectKey;

    const referenceRelease = releaseMap.get(normalizedKey) || null;
    const { mappedIssues, lastSyncedAt } = issuesMap.get(normalizedKey) || {
      rawIssues: [],
      mappedIssues: [],
      lastSyncedAt: null,
    };

    const summary = calculatePortfolioProjectSummary({
      projectKey: normalizedKey,
      projectName,
      period,
      periodLabel,
      mappedIssues,
      freshness,
      unit: params.unit ?? "auto",
      lastSyncedAt,
      referenceRelease: referenceRelease
        ? {
            id: referenceRelease.id,
            name: referenceRelease.name,
            releaseDate: referenceRelease.releaseDate,
          }
        : null,
      now,
    });

    summaries.push(summary);
  }

  // Roll up, filter, and sort summaries via pure calculator
  const { projects, summary } = calculatePortfolioRollup(summaries, params.filterHealth);

  return {
    generatedAt: now.toISOString(),
    timezone: period.timezone,
    period,
    periodLabel,
    freshness,
    summary,
    projects,
  };
}

