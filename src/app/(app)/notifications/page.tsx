import { Suspense } from "react";
import type { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSession } from "@/lib/session";
import { getServerQueryClient } from "@/lib/query-server";
import { notificationsKeys } from "@/lib/query-keys";
import { listNotifications } from "@/lib/notify/list";
import { logSwallowed } from "@/lib/logger";
import { NotificationsClient } from "./notifications-client";
import NotificationsLoading from "./loading";

export const metadata: Metadata = {
  title: "Trung tâm thông báo",
  description: "Quản lý và xem lịch sử thông báo trong hệ thống Team Task Web",
};

export default async function NotificationsPage() {
  const session = await getSession();
  const queryClient = getServerQueryClient();

  if (session?.user?.id) {
    try {
      await queryClient.prefetchInfiniteQuery({
        queryKey: notificationsKeys.infinite({ unreadOnly: false, type: undefined }),
        queryFn: ({ pageParam }) =>
          listNotifications(session.user.id, {
            limit: 30,
            unreadOnly: false,
            cursor: (pageParam as string | undefined) ?? undefined,
          }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage: { nextCursor?: string | null }) =>
          lastPage.nextCursor ?? undefined,
        pages: 1,
      });
    } catch (err) {
      logSwallowed("notifications.prefetch", err);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<NotificationsLoading />}>
        <NotificationsClient />
      </Suspense>
    </HydrationBoundary>
  );
}
