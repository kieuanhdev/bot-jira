"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export type IssueItem = {
  jiraKey: string;
  projectKey: string;
  summary: string;
  description: string;
  status: string;
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
};

export type IssueResponse = {
  items: IssueItem[];
  total: number;
  sync: {
    projects: string[];
    lastSuccessAt: string | null;
    stale: boolean;
    freshnessMinutes: number;
    errors: { project: string; error: string }[];
  };
};

export type BoardFilters = {
  project?: string;
  /** Comma-separated project keys to scope the query to (e.g. "MR,EPM"). */
  projectList?: string;
  assignee?: string;
  label?: string;
  priority?: string;
  status?: string;
  releaseLabel?: string;
  q?: string;
  includeDone?: boolean;
  limit?: number;
};

export function useIssues(
  filters: BoardFilters = {},
  opts: { enabled?: boolean } = {}
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === "") return;
    // Booleans become "1"/"0" (we want to send includeDone=0 explicitly too).
    params.set(k, v === true ? "1" : v === false ? "0" : String(v));
  });
  const qs = params.toString();
  return useQuery({
    queryKey: ["issues", qs || "all"],
    queryFn: () => api<IssueResponse>(`/api/issues${qs ? "?" + qs : ""}`),
    refetchInterval: 30000,
    retry: 1,
    enabled: opts.enabled ?? true,
  });
}
