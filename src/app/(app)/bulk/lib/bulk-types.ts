export type BulkFieldValues = {
  assignee?: string | null;
  labels?: string[];
  priority?: string;
  points?: number | null;
  estimate?: string;
  dueDate?: string | null;
  fixVersions?: string[];
};

export type BulkAction =
  | {
      kind: "update-fields";
      value: BulkFieldValues;
    }
  | {
      kind: "log-work";
      value: { timeSpent: string; started?: string; comment?: string };
    };

export type PreviewItem = {
  jiraKey: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  warning: string | null;
  skipReason: string | null;
  transitionName: string | null;
  branchName: string | null;
  targetField: { id: string; name: string } | null;
  targetVersionId: string | null;
  exists: boolean;
};

export type Preview = {
  operationId: string;
  type: string;
  total: number;
  actionable: number;
  skipped: number;
  items: PreviewItem[];
};

export type BulkVersionOption = {
  name: string;
  projects: string[];
  releasedProjects: string[];
  archivedProjects: string[];
};

export type ProjectFieldOption = {
  id: "assignee" | "labels" | "priority" | "points" | "estimate" | "dueDate" | "fixVersions";
  jiraFieldId: string;
  name: string;
  available: boolean;
  options?: string[];
};

export type OpListItem = {
  id: string;
  type: string;
  state: string;
  total: number;
  succeeded: number;
  failed: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type OpDetail = {
  operation: {
    id: string;
    type: string;
    state: string;
    total: number;
    succeeded: number;
    failed: number;
    items: {
      jiraKey: string;
      status: string;
      error: string | null;
      attemptCount: number;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
    }[];
  };
};

export const ACTION_LABELS: Record<string, string> = {
  "update-fields": "Cập nhật nhiều trường",
  assign: "Gán người phụ trách",
  "add-labels": "Thêm nhãn",
  "remove-labels": "Xóa nhãn",
  "set-points": "Đặt Story/Task Points",
  "set-estimate": "Đặt Estimate",
  "log-work": "Ghi Worklog",
  "set-due-date": "Đặt Due date",
  "set-priority": "Đặt độ ưu tiên",
  transition: "Chuyển trạng thái",
  "add-fix-version": "Thêm Fix Version",
  "remove-fix-version": "Xóa Fix Version",
  "add-comment": "Thêm bình luận",
  "create-branches": "Tạo nhánh Bitbucket",
};

export type PreviewBucket = "changes" | "unchanged" | "warnings" | "blocked";

export const SKIP_LABELS: Record<string, string> = {
  not_in_cache: "không có trong cache",
  no_change: "không thay đổi (no-op)",
  no_transition: "không có luồng chuyển trạng thái",
  auth_error: "lỗi xác thực Jira",
  rate_limited: "Jira giới hạn tần suất",
  upstream_unavailable: "Jira không phản hồi",
  unverified: "chưa thể xác thực",
  field_unavailable: "trường không khả dụng trên màn hình Jira",
  points_field_unavailable: "trường điểm không khả dụng trên màn hình Jira",
  estimate_field_unavailable: "trường estimate không khả dụng trên màn hình Jira",
  duedate_field_unavailable: "trường due date không khả dụng trên màn hình Jira",
  fixversions_field_unavailable: "trường fix versions không khả dụng trên màn hình Jira",
  version_not_found: "version không tồn tại trong dự án",
  version_unverified: "chưa xác thực được version trong Jira",
  bulk_field_update_requires_single_project: "tất cả task phải thuộc cùng một dự án",
};

export const CATEGORY_DOTS: Record<string, string[]> = {
  new: ["bg-sky-400", "bg-cyan-500", "bg-blue-400", "bg-indigo-400", "bg-teal-400", "bg-sky-600", "bg-cyan-400", "bg-blue-500"],
  indeterminate: ["bg-primary", "bg-cyan-500", "bg-sky-600", "bg-blue-500", "bg-indigo-500", "bg-primary/70"],
  done: ["bg-emerald-500", "bg-green-500", "bg-teal-500", "bg-lime-500", "bg-emerald-400", "bg-green-400"],
};

export const CATEGORY_TEXT: Record<string, string> = {
  new: "text-sky-600 dark:text-sky-400",
  indeterminate: "text-primary",
  done: "text-emerald-600 dark:text-emerald-400",
};
