import { Suspense } from "react";
import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query-server";
import { adminKeys } from "@/lib/query-keys";
import { listAdminProjectSync } from "@/lib/admin/project-sync";
import { logSwallowed } from "@/lib/logger";
import { AdminSyncClient } from "./admin-sync-client";
import AdminSyncLoading from "./loading";

export const metadata: Metadata = { title: "Quản trị · Đồng bộ dự án" };

export default async function AdminSyncPage() {
  const queryClient = getServerQueryClient();

  try {
    await queryClient.prefetchQuery({
      queryKey: adminKeys.projects,
      queryFn: async () => ({
        items: await listAdminProjectSync(),
        generatedAt: new Date().toISOString(),
      }),
    });
  } catch (err) {
    logSwallowed("admin.sync.prefetch", err);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<AdminSyncLoading />}>
        <AdminSyncClient />
      </Suspense>
    </HydrationBoundary>
  );
}
