"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { notificationsKeys } from "@/lib/query-keys";

export function NotificationEvents() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    const events = new EventSource("/api/notify/stream");
    events.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.all });
    };
    return () => events.close();
  }, [userId, queryClient]);
  return null;
}
