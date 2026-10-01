"use client";

import { useQuery } from "@tanstack/react-query";
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
  labels: string[];
  fixVersionIds: string[];
  fixVersionNames: string[];
  priority: string;
  points: number | null;
  type: string;
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
  return (
    typeof data === "object" &&
    data !== null &&
    ((data as any).code === "membership_pending" || (data as any).code === "membership_preparing")
  );
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
  releaseLabel?: string;
  q?: string;
  includeDone?: boolean;
  includeBacklogRegardlessOfAssignee?: boolean;
  limit?: number;
  /** Skip the first N rows (stable order: updatedAt desc, jiraKey asc). */
  offset?: number;
};

export function useIssues(
  filters: BoardFilters = {},
  opts: { enabled?: boolean } = {}
) {
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
  const qs = params.toString();
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

/**
 * Fetch the next page of issues beyond `offset` using the same filters. Used by
 * the board's "Load more" so projects with more than the first page's limit
 * don't silently truncate. The result is appended to the existing list.
 */
export async function fetchIssuesPage(
  filters: BoardFilters,
  offset: number,
  limit = 1000
): Promise<IssueResponse> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === "") return;
    if (Array.isArray(v)) {
      if (v.length > 0) {
        params.set(k, v.join(","));
      }
      return;
    }
    params.set(k, v === true ? "1" : v === false ? "0" : String(v));
  });
  params.set("offset", String(offset));
  params.set("limit", String(limit));
  const qs = params.toString();
  return api<IssueResponse>(`/api/issues?${qs}`);
}
