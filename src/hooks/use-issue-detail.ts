"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { issuesKeys, staleKeys, branchesForKeys, watchKeys } from "@/lib/query-keys";
import type { CreateWorklogResult } from "@/lib/worklogs/schema";

export type WorklogBody = {
  timeSpent: string;
  startedAt: string;
  comment?: string;
  adjustEstimate: string;
  idempotencyKey: string;
};

export function useIssueFieldMutation(jiraKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api(`/api/issues/${jiraKey}`, { method: "PATCH", body: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: issuesKeys.all });
    },
  });
}

export function useIssueTransition(jiraKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (transitionId: string) =>
      api(`/api/issues/${jiraKey}/transition`, { method: "POST", body: { transitionId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: issuesKeys.all });
    },
  });
}

export function useIssueWatch(jiraKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`/api/issues/${jiraKey}/watch`, { method: "POST", body: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: watchKeys.all });
    },
  });
}

export function useIssueAiScore(jiraKey: string) {
  return useMutation({
    mutationFn: () =>
      api(`/api/issues/${jiraKey}/ai-score`, { method: "POST", body: {} }),
  });
}

export function useIssueAiDecision(jiraKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { decision: "accepted" | "edited" | "rejected"; points?: number }) =>
      api(`/api/issues/${jiraKey}/ai-score/decision`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: issuesKeys.all });
    },
  });
}

export function useIssueComment(jiraKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { body: string }) =>
      api(`/api/issues/${jiraKey}/comments`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: issuesKeys.all });
    },
  });
}

export function useIssueCreateBranch(jiraKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ ok: boolean; branch?: string; error?: string }>(
        `/api/issues/${jiraKey}/branches`,
        { method: "POST", body: {} }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: branchesForKeys.forIssue(jiraKey) });
    },
  });
}

export function useIssueWorklog(jiraKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WorklogBody) =>
      api<CreateWorklogResult>(`/api/issues/${jiraKey}/worklogs`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: issuesKeys.all });
      qc.invalidateQueries({ queryKey: staleKeys.all });
    },
  });
}
