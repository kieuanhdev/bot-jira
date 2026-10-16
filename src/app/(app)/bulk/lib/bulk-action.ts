import {
  type IssueFilters,
  effectiveAssignees,
} from "@/lib/issues/issue-filters";
import type {
  BulkAction,
  BulkFieldValues,
  Preview,
  PreviewBucket,
  ProjectFieldOption,
} from "./bulk-types";
import { previewBucket } from "./bulk-utils";
import type { PeopleState } from "./use-bulk-field-state";

export type OperationKind = "update-fields" | "transition" | "log-work";
export type SelectionMode = "pick" | "filter";

export function isValidEstimate(estimate: string): boolean {
  return !estimate.trim() || /^(?=.*\d)(?:\d+[wdhm]\s*)+$/i.test(estimate.trim());
}

export interface BulkActionInput {
  filterProject: string;
  operationKind: OperationKind;
  targetStatus: string;
  worklogDuration: string;
  isWorklogDurationValid: boolean;
  worklogStarted: string;
  worklogComment: string;
  enabledFields: Set<string>;
  clearAssignee: boolean;
  assignee: string;
  clearLabels: boolean;
  label: string;
  priority: string;
  issueType: string;
  clearPoints: boolean;
  points: string;
  availableFieldMap: Map<string, ProjectFieldOption>;
  estimate: string;
  isEstimateValid: boolean;
  clearDueDate: boolean;
  dueDate: string;
  clearFixVersions: boolean;
  fixVersions: string[];
  clearEpic: boolean;
  epic: string;
  people: PeopleState;
}

/** The bulk action described by the form, or null while the form is incomplete or invalid. */
export function buildBulkAction({
  filterProject,
  operationKind,
  targetStatus,
  worklogDuration,
  isWorklogDurationValid,
  worklogStarted,
  worklogComment,
  enabledFields,
  clearAssignee,
  assignee,
  clearLabels,
  label,
  priority,
  issueType,
  clearPoints,
  points,
  availableFieldMap,
  estimate,
  isEstimateValid,
  clearDueDate,
  dueDate,
  clearFixVersions,
  fixVersions,
  clearEpic,
  epic,
  people,
}: BulkActionInput): BulkAction | null {
  if (!filterProject) return null;

  if (operationKind === "transition") {
    if (!targetStatus.trim()) return null;
    return {
      kind: "transition",
      value: targetStatus.trim(),
    };
  }

  if (operationKind === "log-work") {
    if (!worklogDuration.trim() || !isWorklogDurationValid) return null;
    return {
      kind: "log-work",
      value: {
        timeSpent: worklogDuration.trim(),
        ...(worklogStarted ? { started: worklogStarted } : {}),
        ...(worklogComment.trim() ? { comment: worklogComment.trim() } : {}),
      },
    };
  }

  const value: BulkFieldValues = {};

  if (enabledFields.has("assignee")) {
    if (!clearAssignee && !assignee.trim()) return null;
    value.assignee = clearAssignee ? null : assignee.trim();
  }
  if (enabledFields.has("labels")) {
    if (clearLabels) {
      value.labels = [];
    } else {
      const parsed = label.split(",").map((item) => item.trim()).filter(Boolean);
      value.labels = parsed;
    }
  }
  if (enabledFields.has("priority")) {
    if (!priority) return null;
    value.priority = priority;
  }
  if (enabledFields.has("issueType")) {
    if (!issueType) return null;
    value.issueType = issueType;
  }
  if (enabledFields.has("points")) {
    if (clearPoints) {
      value.points = null;
    } else {
      if (!points) return null;
      value.points = Number(points);
    }
  }
  if (enabledFields.has("estimate") && availableFieldMap.get("estimate")?.available !== false) {
    if (!estimate.trim() || !isEstimateValid) return null;
    value.estimate = estimate.trim();
  }
  if (enabledFields.has("dueDate")) {
    if (!clearDueDate && !dueDate) return null;
    value.dueDate = clearDueDate ? null : dueDate;
  }
  if (enabledFields.has("fixVersions")) {
    if (clearFixVersions) {
      value.fixVersions = [];
    } else {
      value.fixVersions = fixVersions;
    }
  }
  if (enabledFields.has("epic")) {
    if (clearEpic) {
      value.epic = null;
    } else {
      if (!epic.trim()) return null;
      value.epic = epic.trim().toUpperCase();
    }
  }

  for (const role of ["reporter", "approver", "tester"] as const) {
    if (!enabledFields.has(role)) continue;
    const { value: name, clear } = people[role];
    if (!clear && !name.trim()) return null;
    value[role] = clear ? null : name.trim();
  }

  return Object.keys(value).length > 0 ? { kind: "update-fields", value } : null;
}

interface PreviewRequestParams {
  selectionMode: SelectionMode;
  filterProject: string;
  taskFilters: IssueFilters;
  selected: Set<string>;
  action: BulkAction;
  quickFilter?: string;
}

/** Body of the `POST /api/issues/bulk` preview request. */
export function buildPreviewRequestBody({
  selectionMode,
  filterProject,
  taskFilters,
  selected,
  action,
  quickFilter,
}: PreviewRequestParams) {
  const activeAssignees = effectiveAssignees(taskFilters.assigneeScope);
  const isAllAssignees = activeAssignees === "ALL";
  const body =
    selectionMode === "filter"
      ? {
          selector: {
            mode: "filter",
            project: filterProject,
            filters: {
              q: taskFilters.query || undefined,
              assignees: isAllAssignees ? "ALL" : activeAssignees,
              statuses: taskFilters.statuses.length > 0 ? taskFilters.statuses : undefined,
              labels: taskFilters.labels.length > 0 ? taskFilters.labels : undefined,
              priorities: taskFilters.priorities.length > 0 ? taskFilters.priorities : undefined,
              epics: taskFilters.epics && taskFilters.epics.length > 0 ? taskFilters.epics : undefined,
              types: taskFilters.types && taskFilters.types.length > 0 ? taskFilters.types : undefined,
              fixVersions: taskFilters.fixVersions && taskFilters.fixVersions.length > 0 ? taskFilters.fixVersions : undefined,
              reporters: taskFilters.reporters && taskFilters.reporters.length > 0 ? taskFilters.reporters : undefined,
              approvers: taskFilters.approvers && taskFilters.approvers.length > 0 ? taskFilters.approvers : undefined,
              testers: taskFilters.testers && taskFilters.testers.length > 0 ? taskFilters.testers : undefined,
              roles: taskFilters.roles && taskFilters.roles.length > 0 ? taskFilters.roles : undefined,
              overdue: taskFilters.overdue || undefined,
              quickFilter: quickFilter || undefined,
            },
          },
          action,
        }
      : {
          selector: {
            mode: "keys",
            keys: Array.from(selected),
          },
          action,
        };
  return body;
}

export function countPreviewBuckets(preview: Preview | null): Record<PreviewBucket, number> {
  return preview?.items.reduce<Record<PreviewBucket, number>>(
    (counts, item) => {
      counts[previewBucket(item)] += 1;
      return counts;
    },
    { changes: 0, unchanged: 0, warnings: 0, blocked: 0 }
  ) ?? { changes: 0, unchanged: 0, warnings: 0, blocked: 0 };
}

export function getConfirmLabel({
  preview,
  isLogWorkOp,
  isTransitionOp,
  targetStatus,
}: {
  preview: Preview | null;
  isLogWorkOp: boolean;
  isTransitionOp: boolean;
  targetStatus: string;
}): string {
  return preview
    ? isLogWorkOp
      ? `Ghi worklog ${preview.actionable} task`
      : isTransitionOp
        ? `Chuyển trạng thái ${preview.actionable} task sang "${targetStatus || (preview.items[0]?.after?.status as string) || ""}"`
        : `Cập nhật ${preview.actionable} task`
    : "Xác nhận thay đổi";
}

export function computePreviewBasis({
  action,
  selectionMode,
  filterProject,
  taskFilters,
  selected,
  quickFilter,
}: {
  action: BulkAction | null;
  selectionMode: SelectionMode;
  filterProject: string;
  taskFilters: IssueFilters;
  selected: Set<string>;
  quickFilter?: string;
}): string {
  if (selectionMode === "filter") {
    return JSON.stringify({
      action,
      mode: "filter",
      project: filterProject,
      filters: taskFilters,
      quickFilter,
    });
  }
  return JSON.stringify({
    action,
    mode: "keys",
    keys: Array.from(selected).sort(),
  });
}
