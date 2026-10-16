import { Suspense } from "react";
import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSession } from "@/lib/session";
import { getServerQueryClient } from "@/lib/query-server";
import { leaderboardKeys } from "@/lib/query-keys";
import { getDefaultLeaderboardPeriod } from "@/lib/leaderboard/period";
import { getLeaderboardData } from "@/lib/leaderboard/service";
import { logSwallowed } from "@/lib/logger";
import { LeaderboardClient } from "./leaderboard-client";
import LeaderboardLoading from "./loading";

export const metadata: Metadata = {
  title: "Bảng Phong Thần Tu Tiên - Team Task Web",
  description: "Bảng xếp hạng cảnh giới tu vi, tích lũy Story Point theo chu kỳ và vinh danh đạo hữu xuất sắc tông môn.",
};

export default async function LeaderboardPage() {
  const session = await getSession();
  const queryClient = getServerQueryClient();

  if (session?.user?.id) {
    try {
      const defaultPeriod = getDefaultLeaderboardPeriod();
      await queryClient.prefetchQuery({
        queryKey: leaderboardKeys.list(
          defaultPeriod.timeframe,
          defaultPeriod.year,
          defaultPeriod.month,
          defaultPeriod.quarter,
          defaultPeriod.project
        ),
        queryFn: async () => {
          const raw = await getLeaderboardData({
            currentUserId: session.user.id,
            timeframe: defaultPeriod.timeframe,
            year: defaultPeriod.year,
            month: defaultPeriod.month,
            quarter: defaultPeriod.quarter,
            project: null,
          });
          return JSON.parse(JSON.stringify(raw));
        },
      });
    } catch (err) {
      logSwallowed("leaderboard.prefetch", err);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<LeaderboardLoading />}>
        <LeaderboardClient />
      </Suspense>
    </HydrationBoundary>
  );
}
