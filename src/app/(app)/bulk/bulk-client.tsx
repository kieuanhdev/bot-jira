"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";
import { useIssues, type IssueItem } from "@/hooks/use-issues";
import { issuesKeys, boardKeys, bulkKeys, meKeys } from "@/lib/query-keys";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CheckCheck,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  CircleX,
  Loader2,
  Eye,
  ArrowRight,
  History,
  ListChecks,
  Search,
  RefreshCw,
  X,
  TriangleAlert,
  PackageOpen,
  ExternalLink,
} from "lucide-react";

export type BulkFieldValues = {
  assignee?: string | null;
  labels?: string[];
  priority?: string;
  points?: number | null;
  estimate?: string;
  dueDate?: string | null;
  fixVersions?: string[];
};

type BulkAction = {
  kind: "update-fields";
  value: BulkFieldValues;
};

type PreviewItem = {
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

type Preview = {
  operationId: string;
  type: string;
  total: number;
  actionable: number;
  skipped: number;
  items: PreviewItem[];
};

type BulkVersionOption = {
  name: string;
  projects: string[];
  releasedProjects: string[];
  archivedProjects: string[];
};

type ProjectFieldOption = {
  id: "assignee" | "labels" | "priority" | "points" | "estimate" | "dueDate" | "fixVersions";
  jiraFieldId: string;
  name: string;
  available: boolean;
};

type OpListItem = {
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

type OpDetail = {
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

const ACTION_LABELS: Record<string, string> = {
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

type PreviewBucket = "changes" | "unchanged" | "warnings" | "blocked";

function itemHasChange(item: PreviewItem): boolean {
  return Object.keys(item.after).some(
    (key) => item.after[key] !== undefined && JSON.stringify(item.before[key]) !== JSON.stringify(item.after[key])
  );
}

function previewBucket(item: PreviewItem): PreviewBucket {
  if (item.skipReason === "no_change" || item.skipReason === "branch_exists") return "unchanged";
  if (item.skipReason) return "blocked";
  if (["not_in_cache", "no_transition"].includes(item.warning ?? "")) return "blocked";
  if (item.warning) return "warnings";
  return itemHasChange(item) ? "changes" : "unchanged";
}

function stateVariant(state: string) {
  switch (state) {
    case "completed":
      return "success" as const;
    case "partially_failed":
      return "warning" as const;
    case "failed":
      return "danger" as const;
    case "running":
    case "queued":
      return "info" as const;
    default:
      return "secondary" as const;
  }
}

function itemVariant(status: string) {
  switch (status) {
    case "succeeded":
      return "success" as const;
    case "failed":
      return "danger" as const;
    case "skipped":
      return "secondary" as const;
    default:
      return "info" as const;
  }
}

const SKIP_LABELS: Record<string, string> = {
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

function warningVariant(warning: string): "warning" | "danger" {
  return warning === "stale_data" ? "warning" : "danger";
}

const CATEGORY_DOTS: Record<string, string[]> = {
  new: ["bg-sky-400", "bg-cyan-500", "bg-blue-400", "bg-indigo-400", "bg-teal-400", "bg-sky-600", "bg-cyan-400", "bg-blue-500"],
  indeterminate: ["bg-primary", "bg-cyan-500", "bg-sky-600", "bg-blue-500", "bg-indigo-500", "bg-primary/70"],
  done: ["bg-emerald-500", "bg-green-500", "bg-teal-500", "bg-lime-500", "bg-emerald-400", "bg-green-400"],
};
const CATEGORY_TEXT: Record<string, string> = {
  new: "text-sky-600 dark:text-sky-400",
  indeterminate: "text-primary",
  done: "text-emerald-600 dark:text-emerald-400",
};

function categoryOf(status: string, statusCategory?: string): string {
  const c = (statusCategory || "").toLowerCase();
  if (c === "new" || c === "indeterminate" || c === "done") return c;
  const s = status.toLowerCase();
  if (/(done|resolved|closed|complete|released)/.test(s)) return "done";
  if (/(in progress|progress|doing|review|active|deploy)/.test(s)) return "indeterminate";
  return "new";
}

function statusDot(status: string, category?: string): string {
  const cat = category ?? categoryOf(status);
  const arr = CATEGORY_DOTS[cat] ?? CATEGORY_DOTS.new;
  let h = 0;
  const s = status.toLowerCase();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function labelList(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ") || "—";
  return v ? String(v) : "—";
}

function formatSecondsToJira(seconds: unknown): string {
  if (typeof seconds !== "number" || Number.isNaN(seconds) || seconds <= 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(hours / 8);
  const remainingHours = hours % 8;
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (remainingHours > 0) parts.push(`${remainingHours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(" ") || `${seconds}s`;
}

function fieldRow(label: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, key: string) {
  const b = before?.[key];
  const a = after?.[key];
  const changed = JSON.stringify(b) !== JSON.stringify(a) && a !== undefined;
  if (!changed && (a === undefined || a === null) && (b === undefined || b === null)) {
    return null;
  }

  let bText: string;
  let aText: string;

  if (key === "estimateSeconds") {
    bText = typeof b === "number" ? formatSecondsToJira(b) : (b ? String(b) : "—");
    aText = typeof a === "number" ? formatSecondsToJira(a) : (a ? String(a) : "—");
  } else if (key === "labels" || key === "fixVersions") {
    bText = labelList(b);
    aText = Array.isArray(a) && a.length === 0 && Array.isArray(b) && b.length > 0
      ? "(Xóa tất cả)"
      : labelList(a);
  } else if (key === "assignee") {
    bText = b ? `@${String(b)}` : "Chưa giao";
    aText = a === null ? "(Bỏ gán)" : (a ? `@${String(a)}` : "Chưa giao");
  } else if (key === "dueDate") {
    bText = b ? String(b) : "—";
    aText = a === null ? "(Xóa ngày)" : (a ? String(a) : "—");
  } else if (key === "points") {
    bText = b != null ? `${b}pt` : "—";
    aText = a === null ? "(Xóa điểm)" : (a != null ? `${a}pt` : "—");
  } else {
    bText = b == null ? "—" : String(b);
    aText = a == null ? "—" : String(a);
  }

  return (
    <div key={key} className={cn("flex items-center gap-2 rounded px-2 py-0.5 text-xs transition-colors", changed && "bg-primary/5")}>
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("truncate", changed && "text-muted-foreground line-through")}>{bText}</span>
      {changed && (
        <>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate font-medium text-foreground">{aText}</span>
          <Badge variant="success" className="ml-auto text-[10px] px-1.5 py-0">Thay đổi</Badge>
        </>
      )}
    </div>
  );
}

export function BulkClient() {
  const qc = useQueryClient();
  const { data: session } = useSession();

  // Load issues from cache
  const { data, isLoading } = useIssues({ includeDone: true, limit: 1000, assignee: "all" });
  const issues: IssueItem[] = useMemo(() => data?.items ?? [], [data?.items]);

  // Jira base URL for deep links
  const { data: meStatus } = useQuery({
    queryKey: meKeys.status,
    queryFn: () => api<{ jiraName: string | null; jiraBaseUrl?: string }>("/api/me/status"),
    retry: 0,
  });
  const jiraBaseUrl = (meStatus?.jiraBaseUrl ?? "").replace(/\/$/, "");

  // Project list
  const { data: projectsData } = useQuery({
    queryKey: boardKeys.projects,
    queryFn: () => api<{ items: { key: string; openCount: number }[] }>("/api/projects"),
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const projectOptions = projectsData?.items ?? [];

  // User preferences (to pre-select the active project)
  const { data: prefs } = useQuery({
    queryKey: meKeys.prefs,
    queryFn: () => api<{ projects: string[]; available: string[] }>("/api/me/preferences"),
    retry: 0,
  });

  // Project scope (MANDATORY)
  const [filterProject, setFilterProject] = useState("");

  // Auto-select the first preferred project (or the first available project)
  useEffect(() => {
    if (filterProject) return; // already selected by user
    const preferred = prefs?.projects ?? [];
    const available = prefs?.available ?? [];
    const projectKeys = projectOptions.map((p) => p.key);
    // Pick the first preferred project that actually exists in the project list
    const pick =
      preferred.find((k) => projectKeys.includes(k)) ??
      available.find((k) => projectKeys.includes(k)) ??
      projectKeys[0] ??
      "";
    if (pick) setFilterProject(pick);
  }, [prefs, projectOptions, filterProject]);

  // Selection mode and task filters
  const [selectionMode, setSelectionMode] = useState<"pick" | "filter">("pick");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [taskSearch, setTaskSearch] = useState("");

  // Tasks belonging ONLY to the selected project
  const projectIssues = useMemo(
    () => (filterProject ? issues.filter((issue) => issue.projectKey === filterProject) : []),
    [filterProject, issues]
  );
  const availableAssignees = useMemo(
    () => Array.from(new Set(projectIssues.map((issue) => issue.assigneeJira).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b)),
    [projectIssues]
  );
  const labelOptions = useMemo(
    () => Array.from(new Set(projectIssues.flatMap((issue) => issue.labels))).sort((a, b) => a.localeCompare(b)),
    [projectIssues]
  );
  const priorityOptions = useMemo(() => {
    const values = Array.from(new Set(projectIssues.map((issue) => issue.priority).filter(Boolean)));
    return (values.length > 0 ? values : ["Low", "Medium", "High", "Highest", "Blocker"]).sort((a, b) => a.localeCompare(b));
  }, [projectIssues]);

  // Selected task keys
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Enabled fields toggle
  const [enabledFields, setEnabledFields] = useState<Set<string>>(new Set());

  // Field values
  const [assignee, setAssignee] = useState("");
  const [clearAssignee, setClearAssignee] = useState(false);
  const [label, setLabel] = useState("");
  const [clearLabels, setClearLabels] = useState(false);
  const [priority, setPriority] = useState("");
  const [points, setPoints] = useState("");
  const [clearPoints, setClearPoints] = useState(false);
  const [estimate, setEstimate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [clearDueDate, setClearDueDate] = useState(false);
  const [fixVersions, setFixVersions] = useState<string[]>([]);
  const [clearFixVersions, setClearFixVersions] = useState(false);

  // Preview & operation states
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [activeOp, setActiveOp] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewView, setPreviewView] = useState<PreviewBucket>("changes");
  const [previewBasis, setPreviewBasis] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Operations history
  const [ops, setOps] = useState<OpListItem[]>([]);
  const [opsLoaded, setOpsLoaded] = useState(false);

  function loadOps() {
    api<{ items: OpListItem[] }>("/api/bulk/operations?limit=20")
      .then((r) => setOps(r.items))
      .catch(() => null)
      .finally(() => setOpsLoaded(true));
  }

  useEffect(loadOps, []);

  // Fetch project editable fields metadata
  const { data: projectFieldsData, isLoading: fieldsLoading } = useQuery({
    queryKey: bulkKeys.fields(filterProject),
    queryFn: () =>
      api<{
        project: string;
        sampleKey: string | null;
        fields: ProjectFieldOption[];
        fallback: boolean;
      }>(`/api/bulk/fields?project=${encodeURIComponent(filterProject)}`),
    enabled: Boolean(filterProject),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const availableFieldMap = useMemo(() => {
    const map = new Map<string, ProjectFieldOption>();
    (projectFieldsData?.fields ?? []).forEach((f) => map.set(f.id, f));
    return map;
  }, [projectFieldsData?.fields]);

  // Fetch Fix Versions for the selected project
  const selectedProjects = filterProject ? [filterProject] : [];
  const isFixVersionAction = enabledFields.has("fixVersions");
  const { data: bulkVersions, isLoading: versionsLoading } = useQuery({
    queryKey: bulkKeys.versions(selectedProjects),
    queryFn: () =>
      api<{
        items: BulkVersionOption[];
        projects: string[];
        unavailableProjects: string[];
      }>(`/api/bulk/versions?projects=${encodeURIComponent(selectedProjects.join(","))}`),
    enabled: isFixVersionAction && selectedProjects.length > 0,
    staleTime: 60_000,
    retry: 1,
  });
  const versionOptions = bulkVersions?.items ?? [];

  // Reset when changing project
  function handleProjectChange(newProject: string) {
    setFilterProject(newProject);
    setSelected(new Set());
    resetPreview();
    setEnabledFields(new Set());
    setAssignee("");
    setClearAssignee(false);
    setLabel("");
    setClearLabels(false);
    setPriority("");
    setPoints("");
    setClearPoints(false);
    setEstimate("");
    setDueDate("");
    setClearDueDate(false);
    setFixVersions([]);
    setClearFixVersions(false);
  }

  const statusOptions = useMemo(
    () => Array.from(new Set(projectIssues.map((issue) => issue.status).filter(Boolean))).sort(),
    [projectIssues]
  );

  const filteredIssues = useMemo(() => {
    if (!filterProject) return [];
    const query = taskSearch.trim().toLowerCase();
    const myUsername = session?.user?.jiraUsername?.toLowerCase();

    return projectIssues
      .filter((issue) => (filterStatus ? issue.status === filterStatus : true))
      .filter((issue) => {
        if (!filterAssignee || filterAssignee === "ALL") return true;
        if (filterAssignee === "UNASSIGNED") return !issue.assigneeJira;
        if (filterAssignee === "ME") {
          if (!myUsername) return true;
          const a = (issue.assigneeJira ?? "").toLowerCase();
          return a === myUsername || a === myUsername.replace(/_mb$/, "") || `${a}_mb` === myUsername;
        }
        return issue.assigneeJira === filterAssignee;
      })
      .filter((issue) =>
        query ? issue.jiraKey.toLowerCase().includes(query) || issue.summary.toLowerCase().includes(query) : true
      );
  }, [filterProject, filterStatus, filterAssignee, projectIssues, taskSearch, session?.user?.jiraUsername]);

  const allSelected = filteredIssues.length > 0 && filteredIssues.every((i) => selected.has(i.jiraKey));

  const effectiveKeys: string[] =
    selectionMode === "filter"
      ? filteredIssues.map((i) => i.jiraKey)
      : Array.from(selected);

  const effectiveCount = effectiveKeys.length;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected((previous) => {
      const next = new Set(previous);
      if (allSelected) filteredIssues.forEach((issue) => next.delete(issue.jiraKey));
      else filteredIssues.forEach((issue) => next.add(issue.jiraKey));
      return next;
    });
  }

  const isEstimateValid = !estimate.trim() || /^(?=.*\d)(?:\d+[wdhm]\s*)+$/i.test(estimate.trim());

  function buildAction(): BulkAction | null {
    if (!filterProject) return null;
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
    if (enabledFields.has("points")) {
      if (clearPoints) {
        value.points = null;
      } else {
        if (!points) return null;
        value.points = Number(points);
      }
    }
    if (enabledFields.has("estimate")) {
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

    return Object.keys(value).length > 0 ? { kind: "update-fields", value } : null;
  }

  function toggleField(field: string) {
    setEnabledFields((previous) => {
      const next = new Set(previous);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
    resetPreview();
  }

  function resetPreview() {
    setPreview(null);
    setPreviewBasis(null);
  }

  async function doPreview() {
    const action = buildAction();
    if (!action || effectiveCount === 0 || !filterProject) return;
    setPreviewing(true);
    setPreview(null);
    setActiveOp(null);
    setPreviewError(null);
    try {
      const r = await api<Preview>("/api/issues/bulk", {
        method: "POST",
        body: { keys: effectiveKeys, action },
      });
      setPreview(r);
      setPreviewBasis(JSON.stringify({ action, keys: [...effectiveKeys].sort() }));
      setPreviewView("changes");
    } catch (e) {
      setPreview(null);
      setPreviewError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  async function doConfirm() {
    if (!preview) return;
    setConfirming(true);
    try {
      const r = await api<{ operationId: string; queued: boolean }>("/api/issues/bulk", {
        method: "POST",
        body: {
          keys: preview.items.map((i) => i.jiraKey),
          action: buildAction(),
          confirm: true,
          operationId: preview.operationId,
        },
      });
      if (selectionMode === "pick") setSelected(new Set());
      setPreview(null);
      setActiveOp(r.operationId);
      qc.invalidateQueries({ queryKey: issuesKeys.all });
      loadOps();
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally {
      setConfirming(false);
    }
  }

  async function doCancelPreview() {
    if (!preview) return;
    try {
      await api(`/api/bulk/operations/${preview.operationId}/cancel`, { method: "POST" });
    } catch {
      /* ignore */
    }
    resetPreview();
  }

  async function doRetry(id: string) {
    try {
      await api(`/api/bulk/operations/${id}/retry`, { method: "POST" });
      setActiveOp(id);
      loadOps();
    } catch (e) {
      setPreviewError((e as Error).message);
    }
  }

  const currentBasis = JSON.stringify({ action: buildAction(), keys: [...effectiveKeys].sort() });
  const previewOutdated = preview != null && previewBasis !== currentBasis;

  const previewCounts = preview?.items.reduce<Record<PreviewBucket, number>>(
    (counts, item) => {
      counts[previewBucket(item)] += 1;
      return counts;
    },
    { changes: 0, unchanged: 0, warnings: 0, blocked: 0 }
  ) ?? { changes: 0, unchanged: 0, warnings: 0, blocked: 0 };

  const visiblePreviewItems = preview?.items.filter((item) => previewBucket(item) === previewView) ?? [];
  const confirmLabel = preview
    ? `Cập nhật ${preview.actionable} task`
    : "Xác nhận thay đổi";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <ListChecks className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wider">Không gian làm việc Jira</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Thao tác hàng loạt theo dự án</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Chọn dự án, lọc task, bật nhiều trường cần cập nhật và kiểm tra bản xem trước trước khi thực thi an toàn.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filterProject && (
            <Badge variant="outline" className="px-3 py-1 font-mono text-xs">
              Dự án: {filterProject}
            </Badge>
          )}
          <Badge variant={effectiveCount > 0 ? "info" : "secondary"} className="w-fit px-3 py-1">
            {effectiveCount} task sẽ được cập nhật
          </Badge>
        </div>
      </header>

      {/* Progress Steps */}
      <ol aria-label="Tiến trình thao tác hàng loạt" className="grid grid-cols-3 overflow-hidden rounded-lg border bg-card">
        {[
          { number: 1, label: "Chọn dự án & task", active: true, done: Boolean(filterProject) && effectiveCount > 0 },
          { number: 2, label: "Chọn trường cần sửa", active: Boolean(filterProject) && effectiveCount > 0, done: Boolean(buildAction()) },
          { number: 3, label: "Xem trước & Chạy", active: Boolean(preview), done: false },
        ].map((step) => (
          <li
            key={step.number}
            className={cn(
              "flex min-w-0 items-center gap-2 border-r px-3 py-3 text-xs last:border-r-0 sm:px-4 sm:text-sm",
              step.active && "bg-primary/5",
              !step.active && "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                step.done
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : step.active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted"
              )}
            >
              {step.done ? <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> : step.number}
            </span>
            <span className="truncate font-medium">{step.label}</span>
          </li>
        ))}
      </ol>

      {/* Step 1 — Project Scope & Task Selection */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b p-4 sm:p-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">1</span>
            Chọn phạm vi dự án & danh sách task
          </CardTitle>
          <CardDescription>
            Bắt buộc chọn một dự án trước. Thao tác hàng loạt chỉ thực hiện trên các task thuộc cùng một dự án.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* Project selector banner */}
          <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1 sm:max-w-xs w-full">
              <label htmlFor="project-scope-select" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                Dự án mục tiêu <span className="text-destructive">*</span>
              </label>
              <Select value={filterProject} onValueChange={handleProjectChange}>
                <SelectTrigger id="project-scope-select" aria-label="Chọn dự án bắt buộc" className="font-medium bg-background">
                  <SelectValue placeholder="— Chọn một dự án —" />
                </SelectTrigger>
                <SelectContent>
                  {projectOptions.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      <span className="font-semibold">{p.key}</span>
                      <span className="ml-2 text-xs text-muted-foreground">({p.openCount} task mở)</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {filterProject ? (
              <div className="flex items-center gap-2">
                <Badge variant="info" className="px-3 py-1">
                  Dự án: {filterProject} · {projectIssues.length} task trong bộ nhớ
                </Badge>
              </div>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Vui lòng chọn dự án để tải danh sách task
              </p>
            )}
          </div>

          {!filterProject ? (
            <div className="flex flex-col items-center p-12 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <ListChecks className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              </span>
              <p className="text-base font-semibold">Chưa chọn dự án</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Hãy chọn một dự án ở trên. Mọi thao tác chỉnh sửa hàng loạt và cấu hình trường sẽ được giới hạn riêng cho dự án đó.
              </p>
            </div>
          ) : (
            <>
              {/* Task filters */}
              <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex w-fit rounded-lg border bg-muted/40 p-1" aria-label="Chế độ chọn">
                  <button
                    type="button"
                    aria-pressed={selectionMode === "pick"}
                    onClick={() => setSelectionMode("pick")}
                    className={cn(
                      "h-8 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors",
                      selectionMode === "pick"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Chọn từng task
                  </button>
                  <button
                    type="button"
                    aria-pressed={selectionMode === "filter"}
                    onClick={() => setSelectionMode("filter")}
                    className={cn(
                      "h-8 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors",
                      selectionMode === "filter"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Tất cả khớp bộ lọc
                  </button>
                </div>
                <div className="relative w-full sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={taskSearch}
                    onChange={(event) => setTaskSearch(event.target.value)}
                    className="pl-9"
                    placeholder={`Tìm kiếm trong ${filterProject}…`}
                    aria-label="Tìm kiếm task"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 border-b p-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Trạng thái</span>
                  <Select value={filterStatus || "ALL"} onValueChange={(value) => setFilterStatus(value === "ALL" ? "" : value)}>
                    <SelectTrigger aria-label="Lọc theo trạng thái"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
                      {statusOptions.map((itemStatus) => <SelectItem key={itemStatus} value={itemStatus}>{itemStatus}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Người phụ trách</span>
                  <Select value={filterAssignee || "ALL"} onValueChange={(value) => setFilterAssignee(value === "ALL" ? "" : value)}>
                    <SelectTrigger aria-label="Lọc theo người phụ trách"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Tất cả người phụ trách</SelectItem>
                      {session?.user?.jiraUsername && (
                        <SelectItem value="ME">Của tôi (@{session.user.jiraUsername})</SelectItem>
                      )}
                      <SelectItem value="UNASSIGNED">Chưa giao (Unassigned)</SelectItem>
                      {availableAssignees.map((a) => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between sm:col-span-2 pt-1">
                  <p className="text-[11px] text-muted-foreground">
                    Có {filteredIssues.length} task khớp bộ lọc trong dự án {filterProject}.
                  </p>
                  {(filterStatus || filterAssignee || taskSearch) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterStatus("");
                        setFilterAssignee("");
                        setTaskSearch("");
                      }}
                      className="cursor-pointer text-[11px] text-primary hover:underline"
                    >
                      Đặt lại bộ lọc
                    </button>
                  )}
                </div>
              </div>

              {selectionMode === "pick" && (
                <div className="flex items-center justify-between border-b px-3 py-2 bg-muted/10">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    Chọn tất cả task đang hiển thị
                  </label>
                  <span className="text-xs text-muted-foreground font-medium">
                    Đã chọn {selected.size} / {filteredIssues.length}
                  </span>
                </div>
              )}

              {/* Task table / list */}
              <div className="max-h-80 overflow-auto">
                {isLoading && (
                  <div className="flex flex-col gap-2 p-4">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))}
                  </div>
                )}
                {filteredIssues.map((i) => {
                  const cat = categoryOf(i.status, i.statusCategory);
                  const dot = statusDot(i.status, cat);
                  const isChecked = selectionMode === "filter" || selected.has(i.jiraKey);
                  return (
                    <label
                      key={i.jiraKey}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 border-b border-l-[3px] px-3 py-2 text-sm last:border-b-0 hover:bg-accent/50",
                        cat === "new" && "border-l-sky-500/60",
                        cat === "indeterminate" && "border-l-primary/60",
                        cat === "done" && "border-l-emerald-500/60",
                        isChecked && "bg-accent/40"
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        disabled={selectionMode === "filter"}
                        onCheckedChange={() => toggle(i.jiraKey)}
                        aria-label={`Chọn ${i.jiraKey}`}
                      />
                      {jiraBaseUrl ? (
                        <a
                          href={`${jiraBaseUrl}/browse/${i.jiraKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="group/link inline-flex w-24 shrink-0 items-center gap-1 font-mono text-xs text-primary hover:underline"
                          title={`Mở ${i.jiraKey} trên Jira`}
                        >
                          {i.jiraKey}
                          <ExternalLink className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/link:opacity-100" aria-hidden />
                        </a>
                      ) : (
                        <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{i.jiraKey}</span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{i.summary}</span>
                      <span
                        className="hidden sm:inline-flex shrink-0 items-center rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground max-w-[130px] truncate"
                        title={i.assigneeJira ? `Người phụ trách: @${i.assigneeJira}` : "Chưa giao"}
                      >
                        {i.assigneeJira ? `@${i.assigneeJira}` : "Chưa giao"}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium">
                        <span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden />
                        <span className={CATEGORY_TEXT[cat]}>{i.status}</span>
                      </span>
                      {i.points != null && (
                        <span className="inline-flex h-4 shrink-0 items-center rounded-full bg-secondary px-1.5 font-mono text-[10px] font-semibold tabular-nums text-secondary-foreground">
                          {i.points}pt
                        </span>
                      )}
                    </label>
                  );
                })}
                {!isLoading && filteredIssues.length === 0 && (
                  <div className="flex flex-col items-center p-10 text-center">
                    <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                      <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    </span>
                    <p className="text-sm font-medium">Không tìm thấy task phù hợp</p>
                    <p className="mt-1 text-xs text-muted-foreground">Xóa từ khóa tìm kiếm hoặc chọn bộ lọc trạng thái/người phụ trách khác.</p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2.5 text-xs">
                <span className="text-muted-foreground">Hiển thị {filteredIssues.length} task</span>
                <span className="font-semibold text-primary">Tổng số task sẽ cập nhật: {effectiveCount}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Step 2 — Field selection & input */}
      <Card>
        <CardHeader className="p-4 sm:p-5">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">2</span>
              Chọn các trường cần sửa
            </span>
            {filterProject && (
              <Badge variant="outline" className="font-normal text-xs">
                Dự án: <span className="font-semibold ml-1">{filterProject}</span>
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {filterProject
              ? `Bật một hoặc nhiều trường có sẵn của dự án ${filterProject}, nhập giá trị mới rồi xem trước trên ${effectiveCount} task đã chọn.`
              : "Vui lòng chọn dự án ở Bước 1 trước khi cấu hình trường."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-5">
          {!filterProject ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed p-6 text-muted-foreground">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <ListChecks className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">Chưa có dự án nào được chọn</p>
                <p className="text-xs text-muted-foreground">Chọn dự án ở Bước 1 để tải cấu hình các trường có thể chỉnh sửa.</p>
              </div>
            </div>
          ) : fieldsLoading ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6].map((idx) => (
                <Skeleton key={idx} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { id: "assignee", label: "Người phụ trách" },
                { id: "labels", label: "Nhãn" },
                { id: "priority", label: "Độ ưu tiên" },
                { id: "points", label: "Story/Task Points" },
                { id: "estimate", label: "Original Estimate" },
                { id: "dueDate", label: "Due date" },
                { id: "fixVersions", label: "Fix Versions" },
              ].map(({ id, label }) => {
                const isAvailable = availableFieldMap.get(id)?.available ?? true;
                const isEnabled = enabledFields.has(id);
                return (
                  <label
                    key={id}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
                      !isAvailable && "opacity-60 cursor-not-allowed bg-muted/20 border-dashed",
                      isAvailable && isEnabled && "border-primary bg-primary/10 text-primary font-medium",
                      isAvailable && !isEnabled && "hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={isEnabled}
                        disabled={!isAvailable}
                        onCheckedChange={() => isAvailable && toggleField(id)}
                      />
                      <span>{label}</span>
                    </div>
                    {!isAvailable && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal">
                        Không khả dụng
                      </Badge>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          {filterProject && enabledFields.size > 0 && (
            <div className="grid grid-cols-1 gap-4 rounded-lg border bg-card/60 p-4 sm:grid-cols-2">
              {enabledFields.has("assignee") && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Người phụ trách (Jira username)</span>
                    <span className="text-[10px] text-muted-foreground">Tự động gợi ý từ dự án</span>
                  </div>
                  <AssigneeInput
                    value={assignee}
                    onChange={(v) => {
                      setAssignee(v);
                      resetPreview();
                    }}
                    options={availableAssignees}
                    disabled={clearAssignee}
                  />
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                    <Checkbox
                      checked={clearAssignee}
                      onCheckedChange={(value) => {
                        setClearAssignee(value === true);
                        resetPreview();
                      }}
                    />
                    Bỏ gán người phụ trách (Unassigned)
                  </label>
                </div>
              )}

              {enabledFields.has("labels") && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Nhãn (Labels)</span>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Checkbox
                        checked={clearLabels}
                        onCheckedChange={(v) => {
                          setClearLabels(v === true);
                          resetPreview();
                        }}
                      />
                      Xóa tất cả nhãn
                    </label>
                  </div>
                  <Input
                    value={label}
                    disabled={clearLabels}
                    onChange={(e) => {
                      setLabel(e.target.value);
                      resetPreview();
                    }}
                    placeholder="release-1.4.2, frontend (cách nhau bằng dấu phẩy)"
                  />
                  {!clearLabels && labelOptions.length > 0 && (
                    <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-md border bg-muted/20 p-2">
                      {labelOptions.map((option) => {
                        const selectedLabels = label.split(",").map((item) => item.trim()).filter(Boolean);
                        const checked = selectedLabels.includes(option);
                        return (
                          <label key={option} className="flex cursor-pointer items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs hover:bg-muted">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(nextChecked) => {
                                const next = nextChecked === true
                                  ? Array.from(new Set([...selectedLabels, option]))
                                  : selectedLabels.filter((item) => item !== option);
                                setLabel(next.join(", "));
                                resetPreview();
                              }}
                            />
                            {option}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {enabledFields.has("priority") && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-foreground">Độ ưu tiên (Priority)</span>
                  <Select
                    value={priority}
                    onValueChange={(v) => {
                      setPriority(v === "ALL" ? "" : v);
                      resetPreview();
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Chọn độ ưu tiên" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">— Chưa chọn —</SelectItem>
                      {priorityOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {enabledFields.has("points") && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Story Points / Task Points</span>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Checkbox
                        checked={clearPoints}
                        onCheckedChange={(v) => {
                          setClearPoints(v === true);
                          resetPreview();
                        }}
                      />
                      Bỏ / Xóa điểm
                    </label>
                  </div>
                  <Select
                    value={points}
                    disabled={clearPoints}
                    onValueChange={(v) => {
                      setPoints(v === "NONE" ? "" : v);
                      resetPreview();
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Chọn số điểm" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">— Chưa chọn —</SelectItem>
                      {[0, 1, 2, 3, 5, 8, 13, 21].map((p) => <SelectItem key={p} value={String(p)}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {enabledFields.has("estimate") && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-foreground">Original Estimate</span>
                  <Input
                    value={estimate}
                    onChange={(e) => {
                      setEstimate(e.target.value);
                      resetPreview();
                    }}
                    placeholder="Ví dụ: 2h, 1d 4h, 30m"
                    className={cn(!isEstimateValid && "border-destructive focus-visible:ring-destructive")}
                  />
                  {!isEstimateValid ? (
                    <span className="text-[11px] text-destructive font-medium">Định dạng không hợp lệ. Ví dụ hợp lệ: 30m, 2h, 1d 4h.</span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Hỗ trợ các đơn vị thời gian Jira: w (tuần), d (ngày), h (giờ), m (phút).</span>
                  )}
                </div>
              )}

              {enabledFields.has("dueDate") && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Due date (Hạn hoàn thành)</span>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Checkbox
                        checked={clearDueDate}
                        onCheckedChange={(v) => {
                          setClearDueDate(v === true);
                          resetPreview();
                        }}
                      />
                      Xóa Due date hiện tại
                    </label>
                  </div>
                  <Input
                    type="date"
                    value={dueDate}
                    disabled={clearDueDate}
                    onChange={(e) => {
                      setDueDate(e.target.value);
                      resetPreview();
                    }}
                  />
                </div>
              )}

              {enabledFields.has("fixVersions") && (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Fix Versions ({filterProject})</span>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Checkbox
                        checked={clearFixVersions}
                        onCheckedChange={(v) => {
                          setClearFixVersions(v === true);
                          resetPreview();
                        }}
                      />
                      Xóa tất cả Fix Versions
                    </label>
                  </div>
                  {clearFixVersions ? (
                    <p className="text-xs text-muted-foreground italic">Tất cả Fix Versions trên các task đã chọn sẽ bị xóa.</p>
                  ) : versionsLoading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : versionOptions.length > 0 ? (
                    <>
                      <div className="grid max-h-48 gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2 sm:grid-cols-2 md:grid-cols-3">
                        {versionOptions.map((version) => (
                          <label key={version.name} className="flex cursor-pointer items-center gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm hover:bg-muted/50 border">
                            <Checkbox
                              checked={fixVersions.includes(version.name)}
                              onCheckedChange={(checked) => {
                                setFixVersions((current) => checked === true
                                  ? Array.from(new Set([...current, version.name]))
                                  : current.filter((name) => name !== version.name));
                                resetPreview();
                              }}
                            />
                            <span className="truncate">{version.name}</span>
                          </label>
                        ))}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Có thể chọn một hoặc nhiều version. Danh sách được lấy từ dự án {filterProject}.
                      </span>
                    </>
                  ) : (
                    <div className="flex items-center gap-3 rounded-md border border-dashed p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                        <PackageOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-sm font-medium">Chưa có Fix Version trên Jira cho dự án {filterProject}</p>
                        <p className="text-xs text-muted-foreground">Tạo version trên Jira cho project đã chọn rồi tải lại trang.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center pt-2">
            <Button
              onClick={doPreview}
              disabled={previewing || effectiveCount === 0 || !filterProject || !buildAction()}
            >
              {previewing ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              Xem trước {effectiveCount > 0 ? `${effectiveCount} ` : ""}thay đổi
            </Button>
            {previewError && (
              <div role="alert" className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{previewError}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 3 — Preview + Confirm */}
      {preview && (
        <Card className="overflow-hidden">
          <CardHeader className="border-b p-4 sm:p-5">
            <CardTitle className="text-base">
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">3</span>
                Xem trước & Chạy
              </span>
            </CardTitle>
            <CardDescription>
              {preview.actionable} trên tổng số {preview.total} task sẽ được thay đổi
              {preview.skipped > 0 ? `, ${preview.skipped} task bị bỏ qua` : ""}. Không có thay đổi nào được thực hiện cho đến khi bạn xác nhận.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
            {previewOutdated && (
              <div role="alert" className="flex flex-col gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex gap-2">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Danh sách chọn hoặc thao tác đã thay đổi sau khi tạo bản xem trước này.
                </span>
                <Button size="sm" variant="outline" onClick={doPreview}>Làm mới xem trước</Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {([
                ["changes", "Sẽ thay đổi", previewCounts.changes, CheckCircle2, "text-emerald-700 dark:text-emerald-400"],
                ["unchanged", "Không đổi", previewCounts.unchanged, CircleDashed, "text-muted-foreground"],
                ["warnings", "Cảnh báo", previewCounts.warnings, CircleAlert, "text-amber-700 dark:text-amber-400"],
                ["blocked", "Bị chặn", previewCounts.blocked, CircleX, "text-red-700 dark:text-red-400"],
              ] as const).map(([bucket, label, count, Icon, color]) => (
                <button
                  key={bucket}
                  type="button"
                  aria-pressed={previewView === bucket}
                  onClick={() => setPreviewView(bucket)}
                  className={cn(
                    "cursor-pointer rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    previewView === bucket && "border-primary bg-primary/5 shadow-sm"
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground font-medium">{label}</span>
                    <Icon className={cn("h-4 w-4", color)} aria-hidden="true" />
                  </span>
                  <span className="mt-1 block text-xl font-semibold">{count}</span>
                </button>
              ))}
            </div>

            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {visiblePreviewItems.map((item) => (
                <div key={item.jiraKey} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center gap-2">
                    {jiraBaseUrl ? (
                      <a
                        href={`${jiraBaseUrl}/browse/${item.jiraKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group/link inline-flex items-center gap-1 font-mono text-xs font-semibold text-primary hover:underline"
                        title={`Mở ${item.jiraKey} trên Jira`}
                      >
                        {item.jiraKey}
                        <ExternalLink className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/link:opacity-100" aria-hidden />
                      </a>
                    ) : (
                      <span className="font-mono text-xs font-semibold">{item.jiraKey}</span>
                    )}
                    {item.warning && (
                      <Badge variant={warningVariant(item.warning)}>{item.warning.replace("_", " ")}</Badge>
                    )}
                    {item.skipReason && (
                      <Badge variant="secondary">{SKIP_LABELS[item.skipReason] ?? item.skipReason.replace("_", " ")}</Badge>
                    )}
                    {item.targetField && (
                      <Badge variant="outline" title={item.targetVersionId ? `${item.targetField.id}: ${item.targetVersionId}` : item.targetField.id}>
                        {item.targetField.name}
                      </Badge>
                    )}
                  </div>
                  {item.skipReason ? (
                    <p className="text-xs text-muted-foreground">
                      Sẽ bỏ qua: {SKIP_LABELS[item.skipReason] ?? item.skipReason.replace("_", " ")}.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1 border-t pt-2 mt-1">
                      {fieldRow("Người phụ trách", item.before, item.after, "assignee")}
                      {fieldRow("Độ ưu tiên", item.before, item.after, "priority")}
                      {fieldRow("Story/Task Points", item.before, item.after, "points")}
                      {fieldRow("Original Estimate", item.before, item.after, "estimateSeconds")}
                      {fieldRow("Due date", item.before, item.after, "dueDate")}
                      {fieldRow("Nhãn (Labels)", item.before, item.after, "labels")}
                      {fieldRow("Fix Versions", item.before, item.after, "fixVersions")}
                    </div>
                  )}
                </div>
              ))}
              {visiblePreviewItems.length === 0 && (
                <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-10 text-center">
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <p className="font-medium">Không có task nào trong nhóm này</p>
                  <p className="mt-1 text-sm text-muted-foreground">Chọn một thẻ tóm tắt khác để xem các task tương ứng.</p>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={confirming || preview.actionable === 0 || previewOutdated}
              >
                {confirming ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}
                {confirmLabel}
              </Button>
              <Button variant="ghost" onClick={doCancelPreview}>
                <X className="h-4 w-4" aria-hidden="true" /> Hủy xem trước
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Operations History */}
      <Card>
        <CardHeader className="p-4 sm:p-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" aria-hidden="true" />
            Lịch sử thao tác
          </CardTitle>
          <CardDescription>Các thao tác hàng loạt gần đây và kết quả chi tiết từng task.</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
          {activeOp && <OperationDetail id={activeOp} jiraBaseUrl={jiraBaseUrl} />}
          {!opsLoaded ? (
            <div className="space-y-2">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-16 w-full" />)}</div>
          ) : ops.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                <History className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </span>
              <p className="font-medium">Chưa có thao tác hàng loạt nào</p>
              <p className="mt-1 text-sm text-muted-foreground">Các thao tác đã hoàn thành hoặc đang chạy sẽ xuất hiện tại đây.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {ops.map((op) => (
                <li key={op.id} className={cn("rounded-lg border p-3 transition-colors", activeOp === op.id && "border-primary bg-primary/[0.03]")}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => setActiveOp(op.id)}
                      className="min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant={stateVariant(op.state)}>{op.state.replace("_", " ")}</Badge>
                        <span className="font-medium">{ACTION_LABELS[op.type] ?? op.type}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">#{op.id.slice(0, 8)}</span>
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {op.succeeded}/{op.total} thành công · {op.failed} thất bại · {formatTime(op.completedAt ?? op.createdAt)}
                      </span>
                    </button>
                    {["completed", "partially_failed", "failed"].includes(op.state) && op.failed > 0 && (
                      <Button size="sm" variant="outline" onClick={() => doRetry(op.id)}>
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Thử lại
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              Xác nhận cập nhật nhiều trường
            </DialogTitle>
            <DialogDescription>
              Bạn sắp cập nhật các trường đã chọn cho {preview?.actionable ?? 0} task thuộc dự án {filterProject}.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">Lưu ý trước khi thực thi</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Hệ thống sẽ cập nhật từng task trên Jira và cập nhật lại cache.</li>
              <li>Nếu một task gặp lỗi, các task còn lại vẫn tiếp tục được thực hiện.</li>
              <li>Bạn có thể theo dõi tiến trình trực tiếp bên dưới.</li>
            </ul>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Quay lại</Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                void doConfirm();
              }}
              disabled={confirming}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Autocomplete text input for a Jira assignee username. Free-typed values are
 * allowed (the cache may not contain every user), but known assignees from the
 * project scope are offered as suggestions to avoid typos.
 */
function AssigneeInput({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const q = value.trim().toLowerCase();
  const matches = (q ? options.filter((o) => o.toLowerCase().includes(q)) : options).slice(0, 8);

  function pick(opt: string) {
    onChange(opt);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="bulk-assignee-options"
        value={value}
        disabled={disabled}
        placeholder="jira username"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul id="bulk-assignee-options" role="listbox" className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {matches.map((opt, i) => (
            <li key={opt}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(opt);
                }}
                className={cn(
                  "w-full cursor-pointer px-3 py-1.5 text-left text-sm",
                  i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                )}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OperationDetail({ id, jiraBaseUrl }: { id: string; jiraBaseUrl: string }) {
  const { data, isFetching, refetch } = useQuery({
    queryKey: bulkKeys.op(id),
    queryFn: () => api<OpDetail>(`/api/bulk/operations/${id}`),
    refetchInterval: (query) =>
      ["running", "queued"].includes(query.state.data?.operation.state ?? "") ? 2000 : false,
  });
  const op = data?.operation;

  if (!op) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-md border border-border p-3 text-sm">
        {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Đang tải chi tiết thao tác…
      </div>
    );
  }

  const done = op.succeeded + op.failed;
  const pct = op.total > 0 ? Math.round((done / op.total) * 100) : 0;

  return (
    <div className="mb-4 rounded-md border border-border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant={stateVariant(op.state)}>{op.state.replace("_", " ")}</Badge>
        <span className="text-sm font-medium">{ACTION_LABELS[op.type] ?? op.type}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {done}/{op.total} hoàn thành
        </span>
      </div>
      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
        {op.items.map((it) => (
          <li key={it.jiraKey} className="flex items-center gap-2">
            <Badge variant={itemVariant(it.status)}>{it.status}</Badge>
            {jiraBaseUrl ? (
              <a
                href={`${jiraBaseUrl}/browse/${it.jiraKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group/link inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                title={`Mở ${it.jiraKey} trên Jira`}
              >
                {it.jiraKey}
                <ExternalLink className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/link:opacity-100" aria-hidden />
              </a>
            ) : (
              <span className="font-mono text-xs">{it.jiraKey}</span>
            )}
            {it.attemptCount > 1 && <span className="text-[11px] text-muted-foreground">({it.attemptCount} lần thử)</span>}
            {it.error && <span className="truncate text-xs text-destructive">{it.error}</span>}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden /> Làm mới
        </Button>
      </div>
    </div>
  );
}
