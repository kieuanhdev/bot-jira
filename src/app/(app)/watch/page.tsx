import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSession } from "@/lib/session";
import { watchKeys } from "@/lib/query-keys";
import { listWatchedItems } from "@/lib/watch/list";
import { getServerQueryClient } from "@/lib/query-server";
import { WatchClient } from "./watch-client";

export const metadata = { title: "My watch" };

export default async function WatchPage() {
  const session = await getSession();
  const queryClient = getServerQueryClient();

  if (session?.user?.id) {
    try {
      await queryClient.prefetchQuery({
        queryKey: watchKeys.all,
        queryFn: async () => {
          const items = await listWatchedItems(session.user.id, session.user.role);
          return { items };
        },
      });
    } catch {
      // Allow graceful fallback to client-side fetching if prefetch fails
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <WatchClient />
    </HydrationBoundary>
  );
}
