import type { QueryClient } from "@tanstack/react-query";
import { issuesKeys } from "@/lib/query-keys";
import type { IssueItem, IssueQueryResult } from "@/hooks/use-issues";
import type { QuickPanelDetail } from "./board-types";

export type IssuePatch = {
  points?: number | null;
  assignee?: string | null;
  priority?: string;
  summary?: string;
  description?: string;
  labels?: string[];
  addLabel?: string;
  removeLabel?: string;
  fixVersions?: string[];
  addFixVersion?: string;
  removeFixVersion?: string;
  [key: string]: unknown;
};

/**
 * Optimistically update TanStack Query caches for an issue across:
 * 1. The issue detail cache `issuesKeys.detail(jiraKey)`
 * 2. All board/list issue caches matching `issuesKeys.all`
 *
 * Returns a rollback callback that restores the exact previous state in case of failure.
 */
export function applyOptimisticIssuePatch(
  qc: QueryClient,
  jiraKey: string,
  patch: IssuePatch,
  fallbackIssue?: Partial<IssueItem>
): () => void {
  const detailKey = issuesKeys.detail(jiraKey);
  const previousDetail = qc.getQueryData<{ issue: QuickPanelDetail }>(detailKey);
  const previousLists = qc.getQueriesData<IssueQueryResult>({ queryKey: issuesKeys.all });

  const updateItem = (item: IssueItem): IssueItem => {
    let nextLabels = item.labels;
    if (patch.labels !== undefined) {
      nextLabels = patch.labels;
    } else if (patch.addLabel) {
      const val = patch.addLabel.trim();
      if (val && !nextLabels.includes(val)) nextLabels = [...nextLabels, val];
    } else if (patch.removeLabel) {
      const val = patch.removeLabel.trim();
      nextLabels = nextLabels.filter((l) => l !== val);
    }

    let nextFixVersionNames = item.fixVersionNames ?? [];
    if (patch.addFixVersion) {
      const val = patch.addFixVersion.trim();
      if (val && !nextFixVersionNames.includes(val)) nextFixVersionNames = [...nextFixVersionNames, val];
    } else if (patch.removeFixVersion) {
      const val = patch.removeFixVersion.trim();
      nextFixVersionNames = nextFixVersionNames.filter((v) => v !== val);
    }

    return {
      ...item,
      ...(patch.points !== undefined ? { points: patch.points } : {}),
      ...(patch.assignee !== undefined ? { assigneeJira: patch.assignee } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      labels: nextLabels,
      fixVersionNames: nextFixVersionNames,
    };
  };

  const updateDetail = (d: QuickPanelDetail): QuickPanelDetail => {
    let nextLabels = d.labels ?? [];
    if (patch.labels !== undefined) {
      nextLabels = patch.labels;
    } else if (patch.addLabel) {
      const val = patch.addLabel.trim();
      if (val && !nextLabels.includes(val)) nextLabels = [...nextLabels, val];
    } else if (patch.removeLabel) {
      const val = patch.removeLabel.trim();
      nextLabels = nextLabels.filter((l) => l !== val);
    }

    let nextFixVersions = d.fixVersions ?? [];
    if (patch.addFixVersion) {
      const val = patch.addFixVersion.trim();
      if (val && !nextFixVersions.includes(val)) nextFixVersions = [...nextFixVersions, val];
    } else if (patch.removeFixVersion) {
      const val = patch.removeFixVersion.trim();
      nextFixVersions = nextFixVersions.filter((v) => v !== val);
    }

    return {
      ...d,
      ...(patch.points !== undefined ? { points: patch.points } : {}),
      ...(patch.assignee !== undefined ? { assigneeJira: patch.assignee } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      labels: nextLabels,
      fixVersions: nextFixVersions,
    };
  };

  // 1. Update the detail query
  qc.setQueryData<{ issue: QuickPanelDetail }>(detailKey, (old) => {
    if (old?.issue) {
      return { ...old, issue: updateDetail(old.issue) };
    }
    if (fallbackIssue) {
      const baseDetail: QuickPanelDetail = {
        summary: fallbackIssue.summary ?? "",
        description: fallbackIssue.description ?? "",
        status: fallbackIssue.status ?? "",
        assigneeJira: fallbackIssue.assigneeJira ?? null,
        reporterJira: fallbackIssue.reporterJira ?? null,
        approverJira: fallbackIssue.approverJira ?? null,
        testerJira: fallbackIssue.testerJira ?? null,
        dueDate: fallbackIssue.dueDate ?? null,
        timeSpentSeconds: fallbackIssue.timeSpent ?? null,
        originalEstimateSeconds: fallbackIssue.originalEstimateSeconds ?? null,
        labels: fallbackIssue.labels ?? [],
        priority: fallbackIssue.priority ?? "",
        points: fallbackIssue.points ?? null,
        type: fallbackIssue.type ?? "",
        createdAt: fallbackIssue.createdAt ?? null,
        updatedAt: fallbackIssue.updatedAt ?? null,
        lastSyncedAt: fallbackIssue.lastSyncedAt ?? new Date().toISOString(),
        aiScore: fallbackIssue.aiScore
          ? { points: fallbackIssue.aiScore.points, confidence: fallbackIssue.aiScore.confidence }
          : null,
        aiDecision: fallbackIssue.aiDecision ? { decision: fallbackIssue.aiDecision.decision } : null,
        staleSnapshots: [],
        comments: [],
        releaseTasks: [],
        fixVersions: fallbackIssue.fixVersionNames ?? [],
      };
      return { issue: updateDetail(baseDetail) };
    }
    return old;
  });

  // 2. Update all issue list queries
  qc.setQueriesData<IssueQueryResult>({ queryKey: issuesKeys.all }, (old) => {
    if (!old || !("items" in old) || !Array.isArray(old.items)) return old;
    let changed = false;
    const newItems = old.items.map((item) => {
      if (item.jiraKey === jiraKey) {
        changed = true;
        return updateItem(item);
      }
      return item;
    });
    return changed ? { ...old, items: newItems } : old;
  });

  // Rollback function
  return function rollback() {
    if (previousDetail !== undefined) {
      qc.setQueryData(detailKey, previousDetail);
    }
    for (const [key, data] of previousLists) {
      qc.setQueryData(key, data);
    }
  };
}

/** Merge per-issue field patches straight into every cached issue list. */
export function patchIssueLists(qc: QueryClient, patches: Map<string, Partial<IssueItem>>): void {
  qc.setQueriesData<IssueQueryResult>({ queryKey: issuesKeys.all }, (old) => {
    if (!old || !("items" in old) || !Array.isArray(old.items)) return old;
    let changed = false;
    const items = old.items.map((item) => {
      const p = patches.get(item.jiraKey);
      if (!p) return item;
      changed = true;
      return { ...item, ...p };
    });
    return changed ? { ...old, items } : old;
  });
}
