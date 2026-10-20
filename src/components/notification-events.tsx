"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { notificationEventQueryKeys } from "./notification-events-keys";

export function NotificationEvents() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    const events = new EventSource("/api/notify/stream");
    events.onmessage = () => {
      // Debounce invalidation to batch rapid notification bursts
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        for (const queryKey of notificationEventQueryKeys()) {
          void queryClient.invalidateQueries({ queryKey });
        }
      }, 300);
    };

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.close();
    };
  }, [userId, queryClient]);

  return null;
}
