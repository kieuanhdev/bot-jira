"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { TaskDeliveryQueryResult } from "@/lib/bitbucket/task-delivery-query";

type SyncResult = { queued?: boolean };
type LinkBody =
  | { action: "confirm" | "reject" | "unlink" | "confirm_all" }
  | { jiraKey: string | null; reason?: string }
  | { action: "link_many"; ids: string[]; jiraKey: string; reason?: string };

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
      api(`/api/branches/${branchId}/link`, { method: "PATCH", body }),
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

/** Unlinked branches (no Jira task yet) for the "attach branch to task" picker. */
export function useUnlinkedBranchPicker(q: string, enabled: boolean) {
  const term = q.trim();
  return useQuery({
    queryKey: ["branches-tasks", "picker", term],
    queryFn: () =>
      api<TaskDeliveryQueryResult>(
        `/api/branches/tasks?view=unlinked&pageSize=15&q=${encodeURIComponent(term)}`
      ),
    enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}
