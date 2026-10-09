import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getLeaderboardData } from "@/lib/leaderboard/service";
import { parseLeaderboardParams } from "@/lib/leaderboard/period";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const filterParams = parseLeaderboardParams(url.searchParams);

  try {
    const data = await getLeaderboardData({
      currentUserId: session.user.id,
      ...filterParams,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[Leaderboard API Error]", error);
    return NextResponse.json(
      {
        error: "failed_to_fetch_leaderboard",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
