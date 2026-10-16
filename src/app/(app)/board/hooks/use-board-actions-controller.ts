"use client";

import { useCallback, useEffect, useRef } from "react";
import type { useRouter } from "next/navigation";
import type { useQueryClient } from "@tanstack/react-query";
import type { IssueItem } from "@/hooks/use-issues";
import type { BoardColumn } from "../lib/board-columns";
import type { QuickAction, Transition } from "../lib/board-types";
import { useBoardActions } from "../lib/board-actions-hook";

interface UseBoardActionsControllerOptions {
  issues: IssueItem[];
  columns: BoardColumn[];
  columnKeys: string[];
  statusCategoryMap: Record<string, string>;
  jiraBaseUrl: string;
  fetchTransitions: (key: string) => Promise<Transition[]>;
  invalidateTransitionCache: (key: string) => void;
  setOptimisticStatus: (key: string, status: string | null) => void;
  setToast: (msg: string | null) => void;
  router: ReturnType<typeof useRouter>;
  qc: ReturnType<typeof useQueryClient>;
  findColumnForIssue: (issue: IssueItem) => string;
  onOptimisticIssueUpdate: (patch: Partial<IssueItem> & { jiraKey: string }) => void;
}

export function useBoardActionsController(options: UseBoardActionsControllerOptions) {
  const {
    transitionBusy,
    handleTransition,
    handleQuickAction,
    handleEdits,
    handleBulkTransition,
    handleInlineTransition,
  } = useBoardActions(options);

  const latestActions = useRef({ handleTransition, handleQuickAction });
  useEffect(() => {
    latestActions.current = { handleTransition, handleQuickAction };
  });

  const stableTransition = useCallback(
    (key: string, target: string) => latestActions.current.handleTransition(key, target),
    []
  );

  const stableQuickAction = useCallback(
    (key: string, action: QuickAction) => latestActions.current.handleQuickAction(key, action),
    []
  );

  const stableEdits = useCallback(
    (
      targets: IssueItem[],
      apiPayload: Record<string, unknown>,
      itemFor: (issue: IssueItem) => Partial<IssueItem>
    ) => {
      void handleEdits(targets, apiPayload, itemFor);
    },
    [handleEdits]
  );

  const stableInlineTransition = useCallback(
    (issue: IssueItem, transitionId: string, toStatusName: string) => {
      void handleInlineTransition(issue, transitionId, toStatusName);
    },
    [handleInlineTransition]
  );

  const stableBulkTransition = useCallback(
    (targets: IssueItem[], toStatusName: string) => {
      void handleBulkTransition(targets, toStatusName);
    },
    [handleBulkTransition]
  );

  return {
    transitionBusy,
    stableTransition,
    stableQuickAction,
    stableEdits,
    stableInlineTransition,
    stableBulkTransition,
  };
}
