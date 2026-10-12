"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { NotificationEvents } from "@/components/notification-events";
import { queryPolicy } from "@/lib/query-policy";

function SessionCacheBoundary() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const currentUserId = session?.user?.id ?? null;
    if (prevUserIdRef.current === undefined) {
      prevUserIdRef.current = currentUserId;
      return;
    }

    if (prevUserIdRef.current !== currentUserId) {
      prevUserIdRef.current = currentUserId;
      queryClient.clear();
    }
  }, [session?.user?.id, queryClient]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: queryPolicy.defaults,
        },
      })
  );
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <SessionCacheBoundary />
        <NotificationEvents />
        {children}
      </QueryClientProvider>
    </SessionProvider>
  );
}

