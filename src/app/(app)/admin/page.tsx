import { Suspense } from "react";
import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query-server";
import { adminKeys } from "@/lib/query-keys";
import { getAdminMetrics } from "@/lib/admin/metrics";
import { listAuditEntries } from "@/lib/admin/audit";
import { logSwallowed } from "@/lib/logger";
import { AdminOverviewClient } from "./admin-overview-client";
import AdminOverviewLoading from "./loading";

export const metadata: Metadata = { title: "Quản trị · Tổng quan" };

export default async function AdminPage() {
  const queryClient = getServerQueryClient();

  try {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: adminKeys.metrics,
        queryFn: () => getAdminMetrics(),
      }),
      queryClient.prefetchQuery({
        queryKey: adminKeys.audit,
        queryFn: () => listAuditEntries(20),
      }),
    ]);
  } catch (err) {
    logSwallowed("admin.overview.prefetch", err);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<AdminOverviewLoading />}>
        <AdminOverviewClient />
      </Suspense>
    </HydrationBoundary>
  );
}
