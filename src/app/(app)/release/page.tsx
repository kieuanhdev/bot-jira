import { Suspense } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSession } from "@/lib/session";
import { getServerQueryClient } from "@/lib/query-server";
import { releasesKeys, boardKeys, meKeys } from "@/lib/query-keys";
import { listReleasesForUser } from "@/lib/releases/list-route-service";
import { listUserProjects } from "@/app/api/projects/route";
import { getMeStatus } from "@/app/api/me/status/route";
import { logSwallowed } from "@/lib/logger";
import { ReleaseClient } from "./release-client";
import ReleaseLoading from "./loading";

export const metadata = { title: "Release" };

export default async function ReleasePage() {
  const session = await getSession();
  const queryClient = getServerQueryClient();

  if (session?.user?.id) {
    await Promise.allSettled([
      (async () => {
        try {
          await queryClient.prefetchQuery({
            queryKey: releasesKeys.list("all"),
            queryFn: () => listReleasesForUser(session, { includeArchived: true }),
          });
        } catch (err) {
          logSwallowed("release.prefetch", err);
        }
      })(),
      (async () => {
        try {
          await queryClient.prefetchQuery({
            queryKey: boardKeys.projects,
            queryFn: async () => {
              const res = await listUserProjects(session.user.id);
              return res ?? { items: [] };
            },
          });
        } catch (err) {
          logSwallowed("release.projects.prefetch", err);
        }
      })(),
      (async () => {
        try {
          await queryClient.prefetchQuery({
            queryKey: meKeys.status,
            queryFn: () => getMeStatus(session.user),
          });
        } catch (err) {
          logSwallowed("release.me-status.prefetch", err);
        }
      })(),
    ]);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<ReleaseLoading />}>
        <ReleaseClient />
      </Suspense>
    </HydrationBoundary>
  );
}
