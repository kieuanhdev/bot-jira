"use client";

import { useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { api, getErrorMessage } from "@/lib/api-client";
import { issuesKeys } from "@/lib/query-keys";
import type { IssueItem } from "@/hooks/use-issues";
import { applyOptimisticIssuePatch } from "../../lib/board-optimistic";
import { FLAG_LABEL } from "../../lib/quick-panel-utils";

interface UseQuickPanelFieldMutationOptions {
  issue: IssueItem;
  qc: QueryClient;
  onOptimisticUpdate?: (patch: Partial<IssueItem> & { jiraKey: string }) => void;
  flagged: boolean;
  onError?: (message: string) => void;
}

export function useQuickPanelFieldMutation({
  issue,
  qc,
  onOptimisticUpdate,
  flagged,
  onError,
}: UseQuickPanelFieldMutationOptions) {
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, unknown>>({});

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: issuesKeys.all });
    qc.invalidateQueries({ queryKey: issuesKeys.detail(issue.jiraKey) });
  }

  async function mutateField(patch: Record<string, unknown>) {
    setOptimisticOverrides((prev) => ({ ...prev, ...patch }));

    const rollback = applyOptimisticIssuePatch(qc, issue.jiraKey, patch, issue);

    onOptimisticUpdate?.({
      jiraKey: issue.jiraKey,
      ...(patch.points !== undefined ? { points: patch.points as number | null } : {}),
      ...(patch.assignee !== undefined ? { assigneeJira: patch.assignee as string | null } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority as string } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary as string } : {}),
      ...(patch.reporter !== undefined ? { reporterJira: patch.reporter as string | null } : {}),
      ...(patch.approver !== undefined ? { approverJira: patch.approver as string | null } : {}),
      ...(patch.tester !== undefined ? { testerJira: patch.tester as string | null } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate as string | null } : {}),
    });

    try {
      await api(`/api/issues/${issue.jiraKey}`, { method: "PATCH", body: patch });
      void invalidate();
    } catch (error) {
      rollback();
      setOptimisticOverrides((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(patch)) delete next[k];
        return next;
      });
      onError?.(getErrorMessage(error, "Không cập nhật được task trên Jira."));
    }
  }

  async function handleTransition(transitionId: string) {
    try {
      await api(`/api/issues/${issue.jiraKey}/transition`, {
        method: "POST",
        body: { transitionId },
      });
      await invalidate();
    } catch {
      // ignore
    }
  }

  async function toggleFlag() {
    await mutateField(flagged ? { removeLabel: FLAG_LABEL } : { addLabel: FLAG_LABEL });
  }

  async function addComment(text: string) {
    await api(`/api/issues/${issue.jiraKey}/comments`, { method: "POST", body: { body: text } });
    await invalidate();
  }

  return {
    optimisticOverrides,
    invalidate,
    mutateField,
    handleTransition,
    toggleFlag,
    addComment,
  };
}
