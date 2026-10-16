import { Suspense } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSession } from "@/lib/session";
import { getServerQueryClient } from "@/lib/query-server";
import { staleKeys } from "@/lib/query-keys";
import { parseStaleQueryParams } from "@/lib/stale/params";
import { getStaleData } from "@/lib/stale/query";
import { logSwallowed } from "@/lib/logger";
import { StaleClient } from "./stale-client";
import StaleLoading from "./loading";

export const metadata = { title: "Phân tích task tồn đọng" };

export default async function StalePage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [session, searchParams] = await Promise.all([
    getSession(),
    props.searchParams ?? Promise.resolve(undefined),
  ]);
  const queryClient = getServerQueryClient();

  if (session?.user?.id) {
    try {
      const viewParam = typeof searchParams?.view === "string" ? searchParams.view : undefined;
      const isTeam = viewParam === "team";
      const defaultAssignee = isTeam ? "ALL" : "me";

      const url = new URL("http://localhost/api/stale");
      if (defaultAssignee !== "ALL") {
        url.searchParams.set("assignee", defaultAssignee);
      }
      const params = parseStaleQueryParams(url);

      await queryClient.prefetchQuery({
        queryKey: staleKeys.list("ALL", defaultAssignee, "ALL", "ALL", "ALL"),
        queryFn: () => getStaleData(session.user, params),
      });
    } catch (err) {
      logSwallowed("stale.prefetch", err);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<StaleLoading />}>
        <StaleClient />
      </Suspense>
    </HydrationBoundary>
  );
}
