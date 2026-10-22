import { Suspense } from "react";
import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query-server";
import { adminKeys } from "@/lib/query-keys";
import { getActivityMetrics, listUserActivities } from "@/lib/activity/service";
import { prisma } from "@/lib/prisma";
import { logSwallowed } from "@/lib/logger";
import { AdminActivityClient } from "./admin-activity-client";
import AdminActivityLoading from "./loading";

export const metadata: Metadata = { title: "Quản trị · Truy cập & Hoạt động" };

export default async function AdminActivityPage() {
  const queryClient = getServerQueryClient();

  const defaultFilters = { range: "today" as const, page: 1, limit: 25 };

  try {
    await queryClient.prefetchQuery({
      queryKey: adminKeys.activity(defaultFilters),
      queryFn: async () => {
        const [metrics, activities, users] = await Promise.all([
          getActivityMetrics(),
          listUserActivities(defaultFilters),
          prisma.user.findMany({
            select: {
              id: true,
              displayName: true,
              email: true,
              jiraUsername: true,
            },
            orderBy: { displayName: "asc" },
          }),
        ]);
        return {
          metrics,
          items: activities.items,
          pagination: activities.pagination,
          users,
        };
      },
    });
  } catch (err) {
    logSwallowed("admin.activity.prefetch", err);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<AdminActivityLoading />}>
        <AdminActivityClient />
      </Suspense>
    </HydrationBoundary>
  );
}
