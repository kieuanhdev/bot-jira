import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getLeaderboardData } from "@/lib/leaderboard/service";
import type { LeaderboardTimeframe } from "@/lib/leaderboard/types";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const timeframeParam = (url.searchParams.get("timeframe") ?? "month").toLowerCase();
  const timeframe: LeaderboardTimeframe = ["month", "quarter", "year", "all"].includes(timeframeParam)
    ? (timeframeParam as LeaderboardTimeframe)
    : "month";

  const yearParam = url.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : undefined;

  const monthParam = url.searchParams.get("month");
  const month = monthParam ? parseInt(monthParam, 10) : undefined;

  const quarterParam = url.searchParams.get("quarter");
  const quarter = quarterParam ? parseInt(quarterParam, 10) : undefined;

  const projectParam = url.searchParams.get("project");
  const project = projectParam ? projectParam.trim().toUpperCase() : null;

  try {
    const data = await getLeaderboardData({
      currentUserId: session.user.id,
      timeframe,
      year: Number.isFinite(year) ? year : undefined,
      month: Number.isFinite(month) ? month : undefined,
      quarter: Number.isFinite(quarter) ? quarter : undefined,
      project,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[Leaderboard API Error]", error);
    return NextResponse.json(
      { error: "failed_to_fetch_leaderboard", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
