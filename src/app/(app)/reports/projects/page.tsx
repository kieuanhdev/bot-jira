import { Suspense } from "react";
import { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getServerQueryClient } from "@/lib/query-server";
import { reportsKeys } from "@/lib/query-keys";
import { resolveUserProjectScope } from "@/lib/reports/scope";
import { getProjectPortfolio } from "@/lib/reports/portfolio-query";
import { buildReportCacheKey, getOrComputeReport } from "@/lib/reports/server-cache";
import { logSwallowed } from "@/lib/logger";
import type { HealthStatus, ReportUnit } from "@/lib/reports/types";
import { parsePeriodParams } from "../lib/parse-period-params";
import { ProjectPortfolioClient } from "./project-portfolio-client";
import ReportsProjectsLoading from "./loading";

export const metadata: Metadata = {
  title: "Báo cáo dự án | Team Task Web",
  description: "Báo cáo tiến độ, sức khỏe, điểm nghẽn và rủi ro danh mục dự án Jira.",
};

export default async function ProjectPortfolioPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [session, searchParams] = await Promise.all([
    getSession(),
    props.searchParams ?? Promise.resolve(undefined),
  ]);
  const queryClient = getServerQueryClient();

  if (session?.user?.id && can(session, "report.view")) {
    try {
      const period = parsePeriodParams(searchParams);
      const health = typeof searchParams?.health === "string" ? searchParams.health : undefined;
      const unit = typeof searchParams?.unit === "string" ? (searchParams.unit as ReportUnit) : "auto";

      const queryParams: Record<string, string> = {
        period: period.preset,
        from: period.from,
        to: period.to,
        timezone: period.timezone,
      };
      if (health) queryParams.health = health;
      if (unit !== "auto") queryParams.unit = unit;

      const userScope = await resolveUserProjectScope(session.user.id, session.user.role);
      const filterHealth = health
        ? (health.split(",").map((h) => h.trim()).filter(Boolean) as HealthStatus[])
        : undefined;

      const cacheKey = buildReportCacheKey("portfolio", {
        allowedProjects: [...userScope.allowedProjects].sort(),
        filterProjects: [],
        filterHealth: filterHealth ? [...filterHealth].sort() : [],
        unit: unit || "auto",
        period: period.preset,
        from: period.from,
        to: period.to,
        timezone: period.timezone,
      });

      await queryClient.prefetchQuery({
        queryKey: reportsKeys.portfolio(queryParams),
        queryFn: async () => {
          const { data } = await getOrComputeReport({
            key: cacheKey,
            ttlMs: 60_000,
            compute: () =>
              getProjectPortfolio({
                allowedProjects: userScope.allowedProjects,
                filterHealth,
                unit: unit !== "auto" ? unit : undefined,
                period: period.preset,
                from: period.from,
                to: period.to,
                timezone: period.timezone,
                catalog: userScope.catalog,
              }),
          });
          return data;
        },
      });
    } catch (err) {
      logSwallowed("portfolio.prefetch", err);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<ReportsProjectsLoading />}>
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          <ProjectPortfolioClient />
        </div>
      </Suspense>
    </HydrationBoundary>
  );
}
