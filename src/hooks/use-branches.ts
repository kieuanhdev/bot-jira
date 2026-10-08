"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

type LinkResult = { ok?: boolean; prSync?: { summary: string } };
type SyncResult = { queued?: boolean };
type LinkBody =
  | { action: "confirm" | "reject" | "unlink" | "confirm_all" }
  | { jiraKey: string | null; reason?: string; replace?: boolean; syncPr?: boolean; unlinkJiraKey?: string }
  | { action: "link_many"; ids: string[]; jiraKey: string; reason?: string; replace?: boolean; syncPr?: boolean };

export function useBranchSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<SyncResult>("/api/branches/sync", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      qc.invalidateQueries({ queryKey: ["branches-tasks"] });
    },
  });
}

export function useBranchLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId, body }: { branchId: string; body: LinkBody }) =>
      api<LinkResult>(`/api/branches/${branchId}/link`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      qc.invalidateQueries({ queryKey: ["branches-tasks"] });
      qc.invalidateQueries({ queryKey: ["releases"] });
    },
  });
}

export type IssueSearchItem = {
  jiraKey: string;
  summary: string;
  status: string;
  statusCategory: string;
  assigneeJira: string | null;
};

export function useIssueSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ["issue-search", term],
    queryFn: () =>
      api<{ items: IssueSearchItem[] }>(`/api/issues/search?q=${encodeURIComponent(term)}`),
    enabled: term.length >= 2,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export type PickerBranch = {
  id: string;
  repo: string;
  branch: string;
  prTitle: string | null;
  prState: string | null;
  lastCommitAt: string | null;
  /** Tasks this branch is already linked to (it may deliver several). */
  linkedKeys: string[];
};

/** Branches that can still be attached to `jiraKey` (unlinked or linked to other tasks). */
export function useBranchPicker(jiraKey: string, q: string, enabled: boolean) {
  const term = q.trim();
  return useQuery({
    queryKey: ["branches-tasks", "picker", jiraKey, term],
    queryFn: () =>
      api<{ items: PickerBranch[] }>(
        `/api/branches/picker?jiraKey=${encodeURIComponent(jiraKey)}&q=${encodeURIComponent(term)}`
      ),
    enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export type PrPlanItem = {
  branchId: string;
  repo: string;
  branch: string;
  target: string;
  targetOptions: string[];
  status: "ready" | "has_open_pr" | "merged" | "same_as_target";
  prId?: number | null;
  prUrl?: string | null;
};

export type PrCreateResult = {
  branchId: string;
  repo: string;
  branch: string;
  target: string;
  status:
    | "created"
    | "skipped_open_pr"
    | "skipped_merged"
    | "skipped_same_target"
    | "no_changes"
    | "forbidden"
    | "error";
  prId?: number;
  prUrl?: string;
  message?: string;
};

/** Dry-run plan of the PRs that would be created for a task's linked branches. */
export function usePrPlan(jiraKey: string, enabled: boolean) {
  return useQuery({
    queryKey: ["branches-tasks", "pr-plan", jiraKey],
    queryFn: () =>
      api<{ plan: { items: PrPlanItem[] } }>("/api/branches/pull-requests", {
        method: "POST",
        body: { jiraKey, dryRun: true },
      }),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useCreatePullRequests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { jiraKey: string; branchIds: string[]; targets: Record<string, string> }) =>
      api<{ summary: string; results: PrCreateResult[] }>("/api/branches/pull-requests", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      qc.invalidateQueries({ queryKey: ["branches-tasks"] });
    },
  });
}
