import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { resolveUserProjectScope } from "@/lib/reports/scope";
import { getProjectPortfolio } from "@/lib/reports/portfolio-query";
import type { HealthStatus, ReportUnit } from "@/lib/reports/types";
import {
  buildReportCacheKey,
  getOrComputeReport,
  isRefreshRequested,
  applyCacheHeaders,
} from "@/lib/reports/server-cache";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!can(session, "report.view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const userScope = await resolveUserProjectScope(session.user.id, session.user.role);

  const url = new URL(req.url);
  const projectsParam = url.searchParams.get("projects");
  const filterProjects = projectsParam
    ? projectsParam.split(",").map((p) => p.trim()).filter(Boolean)
    : undefined;

  const healthParam = url.searchParams.get("health");
  const filterHealth = healthParam
    ? (healthParam.split(",").map((h) => h.trim()).filter(Boolean) as HealthStatus[])
    : undefined;

  const unitParam = url.searchParams.get("unit") as ReportUnit | null;
  const periodParam = url.searchParams.get("period");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const timezoneParam = url.searchParams.get("timezone");

  const bypass = isRefreshRequested(req);
  const cacheKey = buildReportCacheKey("portfolio", {
    allowedProjects: [...userScope.allowedProjects].sort(),
    filterProjects: filterProjects ? [...filterProjects].sort() : [],
    filterHealth: filterHealth ? [...filterHealth].sort() : [],
    unit: unitParam || "auto",
    period: periodParam || "this_week",
    from: fromParam || "",
    to: toParam || "",
    timezone: timezoneParam || "Asia/Ho_Chi_Minh",
  });

  try {
    const { data, cacheStatus, durationMs } = await getOrComputeReport({
      key: cacheKey,
      ttlMs: 60_000,
      bypass,
      compute: () =>
        getProjectPortfolio({
          allowedProjects: userScope.allowedProjects,
          filterProjects,
          filterHealth,
          unit: unitParam || undefined,
          period: periodParam,
          from: fromParam,
          to: toParam,
          timezone: timezoneParam,
          catalog: userScope.catalog,
        }),
    });

    const res = NextResponse.json(data);
    return applyCacheHeaders(res, cacheStatus, durationMs);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "internal_error",
        message: error instanceof Error ? error.message : "Failed to generate portfolio report",
      },
      { status: 500 }
    );
  }
}

