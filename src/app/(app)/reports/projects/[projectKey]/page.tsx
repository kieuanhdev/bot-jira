import { Suspense } from "react";
import { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getServerQueryClient } from "@/lib/query-server";
import { reportsKeys } from "@/lib/query-keys";
import { resolveUserProjectScope, assertProjectAccess } from "@/lib/reports/scope";
import { getProjectReportDetail } from "@/lib/reports/project-query";
import { getProjectTasks } from "@/lib/reports/task-query";
import { getProjectMembers } from "@/lib/reports/member-query";
import { getProjectHistory } from "@/lib/reports/history-query";
import { resolveReportPeriod } from "@/lib/reports/period";
import { buildReportCacheKey, getOrComputeReport } from "@/lib/reports/server-cache";
import { logSwallowed } from "@/lib/logger";
import type { ReportUnit, ReportStatusGroup } from "@/lib/reports/types";
import { parsePeriodParams } from "../../lib/parse-period-params";
import { buildReportQueryParams } from "./lib/report-url-state";
import { ProjectReportClient } from "./project-report-client";
import ProjectDetailLoading from "./loading";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectKey: string }>;
}): Promise<Metadata> {
  const { projectKey } = await params;
  return {
    title: `Báo cáo dự án ${projectKey} | Team Task Web`,
    description: `Báo cáo chi tiết tiến độ, khối lượng, điểm nghẽn và rủi ro dự án ${projectKey}.`,
  };
}

export default async function ProjectDetailPage(props: {
  params: Promise<{ projectKey: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [session, { projectKey }, searchParams] = await Promise.all([
    getSession(),
    props.params,
    props.searchParams ?? Promise.resolve(undefined),
  ]);
  const queryClient = getServerQueryClient();

  if (session?.user?.id && can(session, "report.view")) {
    try {
      const userScope = await resolveUserProjectScope(session.user.id, session.user.role);
      const isAllowed = await assertProjectAccess(projectKey, userScope);

      if (isAllowed) {
        const period = parsePeriodParams(searchParams);
        const versionId = typeof searchParams?.versionId === "string" ? searchParams.versionId : "all";
        const unit = typeof searchParams?.unit === "string" ? (searchParams.unit as ReportUnit) : "auto";
        const tab = typeof searchParams?.tab === "string" ? searchParams.tab : "overview";

        const queryParams = buildReportQueryParams(period, versionId, unit);
        const isVersionScope = versionId !== "all";

        const cacheKey = buildReportCacheKey("project-detail", {
          projectKey,
          versionId: isVersionScope ? versionId : "",
          unit: unit || "auto",
          period: period.preset,
          from: period.from,
          to: period.to,
          timezone: period.timezone,
          comparePrevious: true,
          includeSubtasks: true,
        });

        // 1. Prefetch main project detail report
        await queryClient.prefetchQuery({
          queryKey: reportsKeys.project(projectKey, queryParams),
          queryFn: async () => {
            const { data } = await getOrComputeReport({
              key: cacheKey,
              ttlMs: 60_000,
              compute: () =>
                getProjectReportDetail({
                  projectKey,
                  versionId: isVersionScope ? versionId : undefined,
                  unit: unit !== "auto" ? unit : undefined,
                  period: period.preset,
                  from: period.from,
                  to: period.to,
                  timezone: period.timezone,
                  comparePrevious: true,
                  includeSubtasks: true,
                }),
            });
            return data;
          },
        });

        // 2. Prefetch active tab query if ?tab is specified
        if (tab === "tasks") {
          const activity = typeof searchParams?.activity === "string" ? searchParams.activity : "all";
          const statusGroup =
            typeof searchParams?.statusGroup === "string" && searchParams.statusGroup !== "all"
              ? (searchParams.statusGroup as ReportStatusGroup)
              : null;
          const assignee = typeof searchParams?.assignee === "string" ? searchParams.assignee : "all";
          const search = typeof searchParams?.search === "string" ? searchParams.search : "";
          const offset = typeof searchParams?.offset === "string" ? parseInt(searchParams.offset, 10) || 0 : 0;
          const limit = 20;

          const taskParams: Record<string, string> = {
            timezone: period.timezone,
            limit: String(limit),
            offset: String(offset),
          };
          if (!isVersionScope) {
            taskParams.period = period.preset;
            taskParams.from = period.from;
            taskParams.to = period.to;
          }
          if (isVersionScope) taskParams.versionId = versionId;
          if (activity !== "all") taskParams.activity = activity;
          if (statusGroup) taskParams.statusGroup = statusGroup;
          if (assignee !== "all") taskParams.assignee = assignee;
          if (search.trim()) taskParams.search = search.trim();

          await queryClient.prefetchQuery({
            queryKey: reportsKeys.tasks(projectKey, taskParams),
            queryFn: () =>
              getProjectTasks({
                projectKey,
                period,
                versionId: isVersionScope ? versionId : undefined,
                activity: activity !== "all" ? activity : undefined,
                statusGroup: statusGroup ?? undefined,
                assignee: assignee !== "all" ? assignee : undefined,
                search: search.trim() || undefined,
                limit,
                offset,
              }),
          });
        } else if (tab === "members") {
          const memberParams: Record<string, string> = { timezone: period.timezone };
          if (!isVersionScope) {
            memberParams.period = period.preset;
            memberParams.from = period.from;
            memberParams.to = period.to;
          }
          if (isVersionScope) memberParams.versionId = versionId;

          await queryClient.prefetchQuery({
            queryKey: reportsKeys.members(projectKey, memberParams),
            queryFn: () => {
              const { comparisonPeriod } = resolveReportPeriod({
                period: period.preset,
                from: period.from,
                to: period.to,
                timezone: period.timezone,
              });
              return getProjectMembers({
                projectKey,
                period,
                comparisonPeriod,
                versionId: isVersionScope ? versionId : undefined,
                unit: unit !== "auto" ? unit : undefined,
              });
            },
          });
        } else if (tab === "trends") {
          const histParams: Record<string, string> = { timezone: period.timezone };
          if (!isVersionScope) {
            histParams.period = period.preset;
            histParams.from = period.from;
            histParams.to = period.to;
          }
          if (isVersionScope) histParams.versionId = versionId;

          await queryClient.prefetchQuery({
            queryKey: reportsKeys.history(projectKey, histParams),
            queryFn: () =>
              getProjectHistory({
                projectKey,
                period,
                versionId: isVersionScope ? versionId : undefined,
                unit: unit !== "auto" ? unit : undefined,
              }),
          });
        }
      }
    } catch (err) {
      logSwallowed("project-report.prefetch", err);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<ProjectDetailLoading />}>
        <ProjectReportClient projectKey={projectKey} />
      </Suspense>
    </HydrationBoundary>
  );
}
