"use client";

import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { issuesKeys } from "@/lib/query-keys";

export type IssueItem = {
  jiraKey: string;
  projectKey: string;
  summary: string;
  description: string;
  status: string;
  statusId?: string | null;
  statusCategory: string;
  statusChangedAt: string | null;
  assigneeJira: string | null;
  reporterJira: string | null;
  approverJira: string | null;
  testerJira: string | null;
  labels: string[];
  fixVersionIds: string[];
  fixVersionNames: string[];
  priority: string;
  points: number | null;
  type: string;
  dueDate: string | null;
  timeSpent: number | null;
  originalEstimateSeconds: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastSyncedAt: string;
  aiScore: {
    points: number;
    confidence: number | null;
    reasoning: string;
    risks: string[];
    missingInformation: string[];
    similarTasks: string[];
    model: string;
    promptVersion: string | null;
    scoredAt: string;
  } | null;
  aiDecision: { decision: string; finalPoints: number | null; decidedAt: string } | null;
  delivery?: { branchCount: number; prOpen: boolean; prMerged: boolean } | null;
  epic?: string | null;
};

export type IssuePendingResponse = {
  code: "membership_pending" | "membership_preparing";
  projectKey: string;
  boardId: number;
  retryAfterMs?: number;
};

export type IssueSuccessResponse = {
  items: IssueItem[];
  total: number;
  sync: {
    projects: string[];
    lastSuccessAt: string | null;
    stale: boolean;
    freshnessMinutes: number;
    errors: { project: string; error: string }[];
  };
  membership?: {
    state: string;
    fetchedAt: string | null;
    refreshing: boolean;
    stale: boolean;
    lastErrorCode: string | null;
    itemCount: number;
    truncated: boolean;
  } | null;
};

export type IssueResponse = IssueSuccessResponse;
export type IssueQueryResult = IssueSuccessResponse | IssuePendingResponse;

export function isMembershipPending(data: unknown): data is IssuePendingResponse {
  if (typeof data !== "object" || data === null) return false;
  const code = (data as { code?: unknown }).code;
  return code === "membership_pending" || code === "membership_preparing";
}

export type BoardFilters = {
  project?: string;
  boardId?: number | null;
  /** Comma-separated project keys to scope the query to (e.g. "MR,EPM"). */
  projectList?: string;
  assignee?: string | string[];
  label?: string | string[];
  priority?: string | string[];
  status?: string | string[];
  epic?: string | string[];
  reporter?: string | string[];
  approver?: string | string[];
  tester?: string | string[];
  role?: string | string[];
  type?: string | string[];
  fixVersion?: string | string[];
  overdue?: boolean;
  dueBefore?: string;
  unestimated?: boolean;
  staleDays?: number;
  releaseLabel?: string;
  q?: string;
  includeDone?: boolean;
  includeBacklogRegardlessOfAssignee?: boolean;
  limit?: number;
  /** Skip the first N rows (stable order: updatedAt desc, jiraKey asc). */
  offset?: number;
};

/** Serialize filters into the `/api/issues` query string (also used as the cache key). */
export function buildIssuesQuery(filters: BoardFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === "") return;
    if (Array.isArray(v)) {
      if (v.length > 0) {
        params.set(k, v.join(","));
      }
      return;
    }
    // Booleans become "1"/"0" (we want to send includeDone=0 explicitly too).
    params.set(k, v === true ? "1" : v === false ? "0" : String(v));
  });
  return params.toString();
}

export function useIssues(
  filters: BoardFilters = {},
  opts: { enabled?: boolean } = {}
) {
  const qs = buildIssuesQuery(filters);
  return useQuery<IssueQueryResult>({
    queryKey: issuesKeys.list(qs),
    queryFn: () => api<IssueQueryResult>(`/api/issues${qs ? "?" + qs : ""}`),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (isMembershipPending(data)) {
        return data.retryAfterMs ?? 1500;
      }
      return false;
    },
    retry: 1,
    enabled: opts.enabled ?? true,
  });
}

/** Fetch one page of issues beyond `offset` using the same filters. */
export async function fetchIssuesPage(
  filters: BoardFilters,
  offset: number,
  limit = 1000
): Promise<IssueResponse> {
  return api<IssueResponse>(`/api/issues?${buildIssuesQuery({ ...filters, offset, limit })}`);
}

/**
 * Extra pages for lists with more rows than one request returns ("Xem thêm").
 *
 * Each page is an ordinary cached query shaped like the first page, so optimistic
 * patches and invalidations (which target every `issuesKeys.all` list) keep
 * extra rows in sync instead of leaving them stale. The page count resets when
 * the filters change.
 */
export function useMoreIssues(
  filters: BoardFilters,
  firstPage: IssueSuccessResponse | null,
  opts: { pageSize?: number; onError?: (error: Error) => void } = {}
) {
  const { pageSize = 1000, onError } = opts;
  const baseQs = buildIssuesQuery(filters);
  const [requested, setRequested] = useState<{ qs: string; pages: number }>({ qs: baseQs, pages: 0 });
  const pages = requested.qs === baseQs ? requested.pages : 0;

  const results = useQueries({
    queries: Array.from({ length: pages }, (_, i) => {
      const qs = buildIssuesQuery({ ...filters, offset: (i + 1) * pageSize, limit: pageSize });
      return {
        queryKey: issuesKeys.list(qs),
        queryFn: async () => {
          try {
            return await api<IssueResponse>(`/api/issues?${qs}`);
          } catch (e) {
            onError?.(e as Error);
            throw e;
          }
        },
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        retry: 0, // the "Xem thêm" button is the retry
      };
    }),
  });

  const stamp = results.map((r) => r.dataUpdatedAt).join("|");
  const items = useMemo(() => {
    const seen = new Set((firstPage?.items ?? []).map((i) => i.jiraKey));
    const out: IssueItem[] = [];
    for (const r of results) {
      for (const item of r.data?.items ?? []) {
        if (seen.has(item.jiraKey)) continue;
        seen.add(item.jiraKey);
        out.push(item);
      }
    }
    return out;
    // `stamp` changes exactly when any page's data does; `results` is a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, firstPage]);

  const loading = results.some((r) => r.isFetching && !r.data);
  const total = firstPage?.total ?? 0;
  const hasMore = (firstPage?.items.length ?? 0) + items.length < total;

  function loadMore() {
    if (loading) return;
    // Retry a failed page rather than skipping past it.
    const failed = results.find((r) => r.isError);
    if (failed) {
      void failed.refetch();
      return;
    }
    if (!hasMore) return;
    setRequested({ qs: baseQs, pages: pages + 1 });
  }

  return { items, hasMore, loading, loadMore };
}
