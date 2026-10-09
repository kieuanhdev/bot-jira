import { env } from "@/lib/env";

export type DependencyScope = "none" | "direct" | "recursive";

export type BulkFieldValues = {
  assignee?: string | null;
  labels?: string[];
  priority?: string;
  issueType?: string;
  points?: number | null;
  estimate?: string;
  dueDate?: string | null;
  fixVersions?: string[];
  epic?: string | null;
};

export type BranchParams = {
  /** Bitbucket repo slug, e.g. "team/app". Defaults to the first configured repo. */
  repo?: string;
  /** Base branch to branch off from. Defaults to the configured base branch. */
  base?: string;
  /**
   * Template for the generated branch name. Supports: {issue} (EPM-123),
   * {project} (EPM), {number} (123), {status} (workflow status, lowercased,
   * spaces -> dashes). Defaults to "{project}-{number}".
   */
  nameTemplate?: string;
  /** Add a comment to the issue linking the created branch. */
  comment?: boolean;
};

export const DEFAULT_BRANCH_TEMPLATE = env.bulkBranchTemplate || "{project}-{number}";
export const MAX_KEYS = 500;
export const MAX_FILTER_KEYS = 5000;

export type BulkFilterCriteria = {
  q?: string;
  assignees?: string[] | "ALL";
  statuses?: string[];
  labels?: string[];
  priorities?: string[];
  epics?: string[];
};

export type BulkSelector =
  | { mode: "keys"; keys: string[] }
  | {
      mode: "filter";
      project: string;
      filters: BulkFilterCriteria;
    };

export type BulkAction =
  | { kind: "update-fields"; value: BulkFieldValues }
  | { kind: "assign"; value: string | null }
  | { kind: "add-labels"; value: string[] }
  | { kind: "remove-labels"; value: string[] }
  | { kind: "set-points"; value: number | null }
  | { kind: "set-estimate"; value: string }
  | { kind: "log-work"; value: { timeSpent: string; started?: string; comment?: string } }
  | { kind: "set-due-date"; value: string | null }
  | { kind: "set-priority"; value: string }
  | { kind: "set-epic"; value: string | null }
  | { kind: "transition"; value: string }
  | { kind: "add-fix-version"; value: string; dependencyScope?: DependencyScope }
  | { kind: "remove-fix-version"; value: string; dependencyScope?: DependencyScope; forceRemove?: boolean }
  | { kind: "add-comment"; value: string }
  | { kind: "create-branches"; value: BranchParams };

export type BulkActionKind = BulkAction["kind"];

export type ActionParams = {
  fields?: BulkFieldValues;
  assignee?: string | null;
  labels?: string[];
  priority?: string;
  points?: number | null;
  estimate?: string;
  worklog?: { timeSpent: string; started?: string; comment?: string };
  dueDate?: string | null;
  status?: string;
  fixVersion?: string;
  comment?: string;
  branches?: BranchParams;
  epic?: string | null;
};

export function actionParams(action: BulkAction): ActionParams {
  switch (action.kind) {
    case "update-fields":
      return { fields: action.value };
    case "assign":
      return { assignee: action.value };
    case "add-labels":
    case "remove-labels":
      return { labels: action.value };
    case "set-points":
      return { points: action.value };
    case "set-estimate":
      return { estimate: action.value };
    case "log-work":
      return { worklog: action.value };
    case "set-due-date":
      return { dueDate: action.value };
    case "set-priority":
      return { priority: action.value };
    case "set-epic":
      return { epic: action.value };
    case "transition":
      return { status: action.value };
    case "add-fix-version":
    case "remove-fix-version":
      return { fixVersion: action.value };
    case "add-comment":
      return { comment: action.value };
    case "create-branches":
      return { branches: action.value };
  }
}

/**
 * Request DTOs for bulk operations.
 */
export type BulkPreviewRequest = {
  keys?: string[];
  selector?: BulkSelector;
  action: BulkAction;
};

export type BulkConfirmRequest = {
  confirm: true;
  operationId: string;
};

export type BulkOperationRequest = {
  keys?: unknown;
  selector?: unknown;
  action?: unknown;
  confirm?: boolean;
  operationId?: string;
};

export type BulkConfirmResponse = {
  operationId: string;
  total: number;
  actionable: number;
  skipped: number;
  queued: boolean;
};

/**
 * Validation result types.
 */
export type BulkValidationSuccess = {
  ok: true;
  keys: string[];
  action: BulkAction;
  selector?: BulkSelector;
};

export type BulkValidationFailure = {
  ok: false;
  errors: string[];
};

export type ValidationResult = BulkValidationSuccess | BulkValidationFailure;
