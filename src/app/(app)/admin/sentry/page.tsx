import { Suspense } from "react";
import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query-server";
import { adminKeys } from "@/lib/query-keys";
import { listSentryImports } from "@/lib/admin/sentry";
import { logSwallowed } from "@/lib/logger";
import { AdminSentryClient } from "./admin-sentry-client";
import AdminSentryLoading from "./loading";

export const metadata: Metadata = { title: "Quản trị · Duyệt lỗi Sentry" };

export default async function AdminSentryPage() {
  const queryClient = getServerQueryClient();

  try {
    await queryClient.prefetchQuery({
      queryKey: [...adminKeys.sentry, "review"],
      queryFn: () => listSentryImports("review"),
    });
  } catch (err) {
    logSwallowed("admin.sentry.prefetch", err);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<AdminSentryLoading />}>
        <AdminSentryClient />
      </Suspense>
    </HydrationBoundary>
  );
}
