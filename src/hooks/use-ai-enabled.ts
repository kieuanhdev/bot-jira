"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { meKeys } from "@/lib/query-keys";

/**
 * Whether the server has an LLM provider configured (`aiEnabled` from
 * `/api/me/status`). Shares the `meKeys.status` cache with the rest of the app,
 * so it does not add a request when that query is already loaded. Returns
 * false while loading or on error so AI buttons stay hidden.
 */
export function useAiEnabled(): boolean {
  const { data } = useQuery({
    queryKey: meKeys.status,
    queryFn: () => api<{ aiEnabled?: boolean }>("/api/me/status"),
    retry: 0,
  });
  return data?.aiEnabled === true;
}
