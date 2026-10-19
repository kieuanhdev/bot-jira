import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query-server";
import { sentryKeys } from "@/lib/query-keys";
import { listSentryImports } from "@/lib/sentry/list";
import { sentryScopeFor } from "@/lib/sentry/scope";
import { getSession } from "@/lib/session";
import { logSwallowed } from "@/lib/logger";
import { SentryClient } from "./sentry-client";
import SentryLoading from "./loading";

export const metadata: Metadata = { title: "Lỗi Sentry" };

export default async function SentryPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const queryClient = getServerQueryClient();

  try {
    const scope = await sentryScopeFor(session);
    await queryClient.prefetchQuery({
      queryKey: sentryKeys.list("review", "all"),
      queryFn: () => listSentryImports("review", scope),
    });
  } catch (err) {
    logSwallowed("sentry.prefetch", err);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<SentryLoading />}>
        <SentryClient />
      </Suspense>
    </HydrationBoundary>
  );
}
