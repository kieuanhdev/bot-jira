"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { sentryKeys } from "@/lib/query-keys";
import type { SentryAnalysisResponse } from "@/app/api/sentry/[id]/analysis/route";

const POLL_MS = 3_000;

/**
 * Root-cause analysis of one Sentry issue. With `autoRequest`, the first time
 * it is read as "none" it queues the analysis (opening the issue is the trigger),
 * then polls while the host-side runner works on it.
 */
export function useSentryAnalysis(rowId: string | undefined, { enabled, autoRequest }: { enabled: boolean; autoRequest: boolean }) {
  const queryClient = useQueryClient();
  const id = rowId ?? "";
  const url = `/api/sentry/${encodeURIComponent(id)}/analysis`;
  const active = enabled && Boolean(rowId);

  const query = useQuery({
    queryKey: sentryKeys.analysis(id),
    queryFn: () => api<SentryAnalysisResponse>(url),
    enabled: active,
    staleTime: 10_000,
    retry: false,
    refetchInterval: (q) => {
      const state = q.state.data?.state;
      return state === "pending" || state === "running" ? POLL_MS : false;
    },
  });

  const request = useMutation({
    mutationFn: (force: boolean) => api<SentryAnalysisResponse>(`${url}${force ? "?force=1" : ""}`, { method: "POST" }),
    onSuccess: (data) => queryClient.setQueryData(sentryKeys.analysis(id), data),
  });

  const requested = useRef<string | null>(null);
  const { mutate } = request;
  useEffect(() => {
    if (!autoRequest || !active || query.data?.state !== "none" || requested.current === id) return;
    requested.current = id;
    mutate(false);
  }, [autoRequest, active, query.data?.state, id, mutate]);

  return { query, request };
}
