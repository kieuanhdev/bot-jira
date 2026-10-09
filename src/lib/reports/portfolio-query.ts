import { listActiveProjects } from "@/lib/jira/project-catalog";
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
  fetchReferenceRelease,
  fetchPortfolioProjectIssues,
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
}

export async function getProjectPortfolio(
  params: PortfolioQueryParams
): Promise<ProjectPortfolioResponse> {
  const now = new Date();
  const activeCatalog = await listActiveProjects();
  const catalogMap = new Map(activeCatalog.map((p) => [p.key, p.name]));

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

  const freshness = await getReportFreshness();

  const summaries: ProjectReportSummary[] = [];

  for (const projectKey of projectKeys) {
    const projectName = catalogMap.get(projectKey) || projectKey;

    // Optional reference release (purely informational, not for scope filtering)
    const referenceRelease = await fetchReferenceRelease(projectKey);

    // Query entire project scope (NOT filtered by active release)
    const { mappedIssues, lastSyncedAt } = await fetchPortfolioProjectIssues(projectKey);

    const summary = calculatePortfolioProjectSummary({
      projectKey,
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
