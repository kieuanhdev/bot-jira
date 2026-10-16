"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { queryPolicy } from "@/lib/query-policy";

// Architectural Decision (REF-032.1):
// 1. Root SessionProvider does NOT receive initial session to keep public auth routes
//    (/login, /register) completely static (TASK-11). Passing session at root layout would
//    force all pages into dynamic SSR. A single mount-time /api/auth/session call is an intentional tradeoff.
// 2. SessionCacheBoundary MUST remain here at root level rather than moving into SessionHydrator.
//    Client-side login (login-client.tsx) uses signIn(..., { redirect: false }) + router.push.
//    If the boundary were inside (app)/SessionHydrator, it would remount with undefined ref upon entering
//    (app) and miss user changes, leaking user A cached queries to user B. Root placement ensures
//    queryClient.clear() reliably executes whenever session.user.id transitions.
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
        {children}
      </QueryClientProvider>
    </SessionProvider>
  );
}


