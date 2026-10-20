import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query-server";
import { meKeys, sentryKeys } from "@/lib/query-keys";
import { getMeStatus } from "@/app/api/me/status/route";
import { getMePreferences } from "@/lib/me/preferences";
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
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: sentryKeys.list("review", "all"),
        queryFn: () => listSentryImports("review", scope),
      }),
      queryClient.prefetchQuery({
        queryKey: meKeys.status,
        queryFn: () => getMeStatus(session.user),
      }),
      queryClient.prefetchQuery({
        queryKey: meKeys.prefs,
        queryFn: () => getMePreferences(session.user.id),
      }),
    ]);
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
