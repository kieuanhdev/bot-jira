import { Suspense } from "react";
import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSession } from "@/lib/session";
import { getServerQueryClient } from "@/lib/query-server";
import { branchesKeys, meKeys } from "@/lib/query-keys";
import { listBranchesForUser, listDeliveryTasksForUser } from "@/lib/branches/list-route-service";
import { parseBranchFilters } from "./lib/branches-filter-model";
import { getMeStatus } from "@/app/api/me/status/route";
import { logSwallowed } from "@/lib/logger";
import { BranchesClient } from "./branches-client";
import BranchesLoading from "./loading";

export const metadata: Metadata = {
  title: "Quản lý Branches · Delivery Tasks",
  description: "Theo dõi tiến độ nhánh Git, Pull Request và liên kết Jira task",
};

interface BranchesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BranchesPage({ searchParams }: BranchesPageProps) {
  const session = await getSession();
  const queryClient = getServerQueryClient();

  if (session?.user?.id) {
    try {
      const rawParams = await searchParams;
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(rawParams)) {
        if (typeof value === "string") {
          params.set(key, value);
        } else if (Array.isArray(value)) {
          for (const v of value) {
            params.append(key, v);
          }
        }
      }

      const filters = parseBranchFilters(params);
      const isTechnicalView = filters.view === "all-branches";

      await Promise.all([
        isTechnicalView
          ? queryClient.prefetchQuery({
              queryKey: branchesKeys.list(filters),
              queryFn: () => listBranchesForUser(session.user, filters),
            })
          : queryClient.prefetchQuery({
              queryKey: branchesKeys.tasks(filters),
              queryFn: () =>
                listDeliveryTasksForUser(session.user, {
                  ...filters,
                  view: filters.view === "all-branches" ? "my-work" : filters.view,
                }),
            }),
        queryClient.prefetchQuery({
          queryKey: branchesKeys.facets,
          queryFn: () => listBranchesForUser(session.user, { facetsOnly: true }),
        }),
        queryClient.prefetchQuery({
          queryKey: meKeys.status,
          queryFn: () => getMeStatus(session.user),
        }),
      ]);
    } catch (err) {
      logSwallowed("branches.prefetch", err);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<BranchesLoading />}>
        <BranchesClient />
      </Suspense>
    </HydrationBoundary>
  );
}
