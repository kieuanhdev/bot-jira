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

      const project = typeof searchParams?.project === "string" ? searchParams.project : "ALL";
      const assignee = typeof searchParams?.assignee === "string" ? searchParams.assignee : defaultAssignee;
      const status = typeof searchParams?.status === "string" ? searchParams.status : "ALL";
      const reason = typeof searchParams?.reason === "string" ? searchParams.reason : "ALL";
      const severity = typeof searchParams?.severity === "string" ? searchParams.severity : "ALL";

      const url = new URL("http://localhost/api/stale");
      if (project !== "ALL") url.searchParams.set("project", project);
      if (assignee !== "ALL") url.searchParams.set("assignee", assignee);
      if (status !== "ALL") url.searchParams.set("status", status);
      if (reason !== "ALL") url.searchParams.set("reason", reason);
      if (severity !== "ALL") url.searchParams.set("severity", severity);
      const params = parseStaleQueryParams(url);

      await queryClient.prefetchQuery({
        queryKey: staleKeys.list(project, assignee, status, reason, severity),
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
