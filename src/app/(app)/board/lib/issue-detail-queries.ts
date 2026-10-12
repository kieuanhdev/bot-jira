import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PointerEvent } from "react";
import { api } from "@/lib/api-client";
import { issuesKeys } from "@/lib/query-keys";
import type { QuickPanelDetail } from "./board-types";

/** Live (Jira-backed) detail, shared by the quick panel and hover prefetch. */
export const issueDetailQuery = (key: string) => ({
  queryKey: issuesKeys.detail(key),
  queryFn: () => api<{ issue: QuickPanelDetail }>(`/api/issues/${key}`),
  staleTime: 15_000,
});

/** Instant DB-cache snapshot of the same detail. */
export const issueCachedDetailQuery = (key: string) => ({
  queryKey: [...issuesKeys.detail(key), "cached"] as const,
  queryFn: () => api<{ issue: QuickPanelDetail }>(`/api/issues/${key}?source=cache`),
  staleTime: 15_000,
});

const HOVER_INTENT_MS = 150;

/**
 * Delegated hover prefetch: any ancestor element carrying `data-issue-key`
 * warms the quick-panel detail after a short dwell, so sweeping the mouse
 * across the board doesn't fire a Jira call per card.
 */
export function useIssueHoverPrefetch() {
  const qc = useQueryClient();
  const timer = useRef<number | null>(null);
  const lastKey = useRef<string | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerOver = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return;
      const key = (e.target as HTMLElement).closest<HTMLElement>("[data-issue-key]")?.dataset.issueKey;
      if (!key || key === lastKey.current) return;
      lastKey.current = key;
      cancel();
      timer.current = window.setTimeout(() => {
        void qc.prefetchQuery(issueCachedDetailQuery(key));
        void qc.prefetchQuery(issueDetailQuery(key));
      }, HOVER_INTENT_MS);
    },
    [qc, cancel]
  );

  const onPointerLeave = useCallback(() => {
    cancel();
    lastKey.current = null;
  }, [cancel]);

  return { onPointerOver, onPointerLeave };
}
