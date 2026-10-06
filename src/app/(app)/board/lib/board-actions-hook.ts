"use client";

import { useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { issuesKeys } from "@/lib/query-keys";
import type { IssueItem } from "@/hooks/use-issues";
import { transitionTarget } from "@/lib/jira/board-transitions";
import type { BoardColumn } from "./board-columns";
import { findTransition } from "./board-columns";
import type { QuickAction, Transition } from "./board-types";

interface BoardActionsOptions {
  issues: IssueItem[];
  columns: BoardColumn[];
  columnKeys: string[];
  statusCategoryMap: Record<string, string>;
  jiraBaseUrl: string;
  fetchTransitions: (key: string) => Promise<Transition[]>;
  invalidateTransitionCache: (key: string) => void;
  setOptimisticStatus: (key: string, status: string | null) => void;
  setToast: (toast: string | null) => void;
  router: { push: (url: string) => void };
  qc: QueryClient;
  findColumnForIssue: (issue: IssueItem) => string;
}

export function useBoardActions({
  issues,
  columns,
  columnKeys,
  statusCategoryMap,
  jiraBaseUrl,
  fetchTransitions,
  invalidateTransitionCache,
  setOptimisticStatus,
  setToast,
  router,
  qc,
  findColumnForIssue,
}: BoardActionsOptions) {
  const [transitionBusy, setTransitionBusy] = useState(false);

  async function doTransition(key: string, transitionId: string, revertTo: string | null = null) {
    try {
      await api(`/api/issues/${key}/transition`, {
        method: "POST",
        body: { transitionId },
      });
    } catch (e) {
      const status = (e as ApiError)?.status ?? null;
      setOptimisticStatus(key, revertTo);
      if (status === 403 || status === 401) {
        setToast(`${key}: You don't have permission to make this transition.`);
        return;
      }
      if (status === 409) {
        setToast(`${key}: This transition isn't available from the current state. Move it via Jira.`);
        return;
      }
      setToast(
        `${key}: Couldn't update Jira. The card has been reverted. Try again, or make the change in Jira.`
      );
      return;
    }
    invalidateTransitionCache(key);
    setOptimisticStatus(key, null);
    await qc.invalidateQueries({ queryKey: issuesKeys.all });
  }

  async function handleTransition(key: string, target: string) {
    setTransitionBusy(true);
    setToast(null);
    try {
      let targetKey: string;
      if (target === "__prev__" || target === "__next__") {
        const issue = issues.find((i) => i.jiraKey === key);
        if (!issue) return;
        const currentCol = findColumnForIssue(issue);
        const idx = columnKeys.indexOf(currentCol);
        const nextIdx = target === "__next__" ? idx + 1 : idx - 1;
        if (nextIdx < 0 || nextIdx >= columnKeys.length) return;
        targetKey = columnKeys[nextIdx];
      } else {
        targetKey = target;
      }
      const targetCol = columns.find((c) => c.key === targetKey);
      const targetLabel = targetCol?.label ?? targetKey;

      const issue = issues.find((i) => i.jiraKey === key);
      const fromStatus = issue?.status ?? "";

      if (issue && findColumnForIssue(issue) === targetKey) {
        setTransitionBusy(false);
        return;
      }

      const all = await fetchTransitions(key);
      const found = findTransition(columns, statusCategoryMap, all, targetLabel, targetKey);

      if (!found) {
        setToast(
          `${key}: "${issue?.status || "current"}" cannot move to ${targetLabel}. The workflow doesn't allow this transition.`
        );
        return;
      }

      const targetStatusName = transitionTarget(found);
      setOptimisticStatus(key, targetStatusName);
      await doTransition(key, found.id, fromStatus);
    } catch (e) {
      setOptimisticStatus(key, null);
      setToast(`${key}: ${(e as Error).message.slice(0, 120)}`);
    } finally {
      setTransitionBusy(false);
    }
  }

  async function handleQuickAction(key: string, action: QuickAction) {
    try {
      switch (action.kind) {
        case "openJira": {
          const base = jiraBaseUrl.replace(/\/$/, "");
          if (base) window.open(`${base}/browse/${key}`, "_blank", "noopener");
          else setToast("Jira base URL isn't configured.");
          return;
        }
        case "copyKey": {
          try {
            await navigator.clipboard.writeText(key);
            setToast(`Copied ${key}`);
          } catch {
            setToast("Couldn't copy to clipboard.");
          }
          return;
        }
        case "openFull": {
          router.push(`/issue/${key}`);
          return;
        }
        case "assignee": {
          await api(`/api/issues/${key}`, {
            method: "PATCH",
            body: { assignee: action.value },
          });
          await qc.invalidateQueries({ queryKey: issuesKeys.all });
          setToast(action.value ? `${key} → ${action.value}` : `${key} unassigned`);
          return;
        }
        case "priority": {
          await api(`/api/issues/${key}`, {
            method: "PATCH",
            body: { priority: action.value },
          });
          await qc.invalidateQueries({ queryKey: issuesKeys.all });
          setToast(`${key} priority → ${action.value}`);
          return;
        }
        case "done": {
          const issue = issues.find((i) => i.jiraKey === key);
          const fromStatus = issue?.status ?? null;
          const all = await fetchTransitions(key);
          const doneCol = columns.find((c) => c.category === "done");
          const target = doneCol?.label ?? "Done";
          const found =
            all.find((tr) => {
              const t = transitionTarget(tr);
              const cat = statusCategoryMap[t] ?? statusCategoryMap[t.toLowerCase()];
              return cat === "done";
            }) ?? null;
          if (!found) {
            setToast(`${key}: No "done" transition is available from the current state.`);
            return;
          }
          setOptimisticStatus(key, target);
          await doTransition(key, found.id, fromStatus);
          return;
        }
      }
    } catch (e) {
      const err = e as ApiError;
      const msg = err.status ? `update failed (HTTP ${err.status})` : err.message;
      setToast(`${key}: ${msg.slice(0, 100)}`);
    }
  }

  return {
    transitionBusy,
    handleTransition,
    handleQuickAction,
  };
}
