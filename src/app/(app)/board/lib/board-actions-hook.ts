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
import { applyOptimisticIssuePatch, patchIssueLists } from "./board-optimistic";

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
  /** Mirrors an optimistic change into board-local state (paged-in rows). */
  onOptimisticIssueUpdate?: (patch: Partial<IssueItem> & { jiraKey: string }) => void;
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
  onOptimisticIssueUpdate,
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

  /**
   * Table edit for one or many issues: optimistic list patch, PATCH fan-out
   * (4 at a time), per-issue revert on failure. Returns the failed keys.
   */
  async function handleEdits(
    targets: IssueItem[],
    apiPatch: Record<string, unknown>,
    itemPatchFor: (issue: IssueItem) => Partial<IssueItem>
  ): Promise<string[]> {
    const apply = (patches: Map<string, Partial<IssueItem>>) => {
      patchIssueLists(qc, patches);
      for (const [jiraKey, p] of patches) onOptimisticIssueUpdate?.({ jiraKey, ...p });
    };
    apply(new Map(targets.map((t) => [t.jiraKey, itemPatchFor(t)])));

    const failed: { issue: IssueItem; err: ApiError }[] = [];
    const queue = [...targets];
    const worker = async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        try {
          await api(`/api/issues/${t.jiraKey}`, { method: "PATCH", body: apiPatch });
        } catch (e) {
          failed.push({ issue: t, err: e as ApiError });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, targets.length) }, worker));

    if (failed.length > 0) {
      apply(
        new Map(
          failed.map(({ issue }) => [
            issue.jiraKey,
            Object.fromEntries(
              Object.keys(itemPatchFor(issue)).map((k) => [k, issue[k as keyof IssueItem]])
            ) as Partial<IssueItem>,
          ])
        )
      );
      const first = failed[0].err;
      const reason = first.status ? `HTTP ${first.status}` : first.message;
      setToast(
        targets.length === 1
          ? `${targets[0].jiraKey}: update failed (${reason})`.slice(0, 120)
          : `Cập nhật lỗi ${failed.length}/${targets.length} task (${reason})`.slice(0, 120)
      );
    } else if (targets.length > 1) {
      setToast(`Đã cập nhật ${targets.length} task`);
    }
    void qc.invalidateQueries({ queryKey: issuesKeys.all });
    return failed.map((f) => f.issue.jiraKey);
  }

  /** Bulk status change: each issue picks the transition that lands on `toStatus`. */
  async function handleBulkTransition(targets: IssueItem[], toStatus: string) {
    setToast(null);
    const want = toStatus.trim().toLowerCase();
    let ok = 0;
    let skipped = 0;
    let failed = 0;
    const queue = targets.filter((t) => t.status.toLowerCase() !== want);
    skipped += targets.length - queue.length;
    const worker = async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        try {
          const { transitions } = await api<{ transitions: Transition[] }>(
            `/api/issues/${t.jiraKey}/transitions`
          );
          const found = transitions.find((tr) => transitionTarget(tr).toLowerCase() === want);
          if (!found) {
            skipped++;
            continue;
          }
          await api(`/api/issues/${t.jiraKey}/transition`, {
            method: "POST",
            body: { transitionId: found.id },
          });
          invalidateTransitionCache(t.jiraKey);
          ok++;
        } catch {
          failed++;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
    setToast(
      `Chuyển "${toStatus}": ${ok} thành công` +
        (skipped ? `, ${skipped} bỏ qua (không có transition)` : "") +
        (failed ? `, ${failed} lỗi` : "")
    );
    await qc.invalidateQueries({ queryKey: issuesKeys.all });
  }

  async function handleInlineTransition(issue: IssueItem, transitionId: string, toStatus: string) {
    setToast(null);
    setOptimisticStatus(issue.jiraKey, toStatus || null);
    await doTransition(issue.jiraKey, transitionId, null);
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
          const rollback = applyOptimisticIssuePatch(qc, key, { assignee: action.value });
          try {
            await api(`/api/issues/${key}`, {
              method: "PATCH",
              body: { assignee: action.value },
            });
            void qc.invalidateQueries({ queryKey: issuesKeys.all });
            setToast(action.value ? `${key} → ${action.value}` : `${key} unassigned`);
          } catch (e) {
            rollback();
            throw e;
          }
          return;
        }
        case "priority": {
          const rollback = applyOptimisticIssuePatch(qc, key, { priority: action.value });
          try {
            await api(`/api/issues/${key}`, {
              method: "PATCH",
              body: { priority: action.value },
            });
            void qc.invalidateQueries({ queryKey: issuesKeys.all });
            setToast(`${key} priority → ${action.value}`);
          } catch (e) {
            rollback();
            throw e;
          }
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
    handleEdits,
    handleBulkTransition,
    handleInlineTransition,
  };
}
