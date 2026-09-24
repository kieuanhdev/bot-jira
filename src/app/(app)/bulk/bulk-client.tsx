"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";
import { useIssues, type IssueItem } from "@/hooks/use-issues";
import { issuesKeys, boardKeys, bulkKeys } from "@/lib/query-keys";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  GitBranch,
  ArrowRight,
  History,
  ListChecks,
  Search,
  ShieldAlert,
  RefreshCw,
  X,
  TriangleAlert,
} from "lucide-react";

type BulkAction =
  | { kind: "assign"; value: string | null }
  | { kind: "add-labels"; value: string[] }
  | { kind: "remove-labels"; value: string[] }
  | { kind: "set-points"; value: number | null }
  | { kind: "set-priority"; value: string }
  | { kind: "transition"; value: string }
  | { kind: "add-fix-version"; value: string }
  | { kind: "remove-fix-version"; value: string }
  | { kind: "add-comment"; value: string }
  | { kind: "create-branches"; value: { repo?: string; base?: string; nameTemplate?: string; comment?: boolean } };

type PreviewItem = {
  jiraKey: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  warning: string | null;
  skipReason: string | null;
  transitionName: string | null;
  branchName: string | null;
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
  assign: "Gán người phụ trách",
  "add-labels": "Thêm nhãn",
  "remove-labels": "Xóa nhãn",
  "set-points": "Đặt điểm story",
  "set-priority": "Đặt độ ưu tiên",
  transition: "Chuyển trạng thái",
  "add-fix-version": "Thêm Fix Version",
  "remove-fix-version": "Xóa Fix Version",
  "add-comment": "Thêm bình luận",
  "create-branches": "Tạo nhánh Bitbucket",
};

const ACTION_GROUPS = [
  { label: "Phụ trách", actions: ["assign"] },
  { label: "Kế hoạch", actions: ["set-points", "set-priority", "add-labels", "remove-labels"] },
  { label: "Quy trình & Phát hành", actions: ["transition", "add-fix-version", "remove-fix-version"] },
  { label: "Cộng tác & Phát triển", actions: ["add-comment", "create-branches"] },
] as const;

const HIGH_RISK_ACTIONS = new Set(["transition", "add-comment", "create-branches"]);

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
};

function warningVariant(warning: string): "warning" | "danger" {
  return warning === "stale_data" ? "warning" : "danger";
}

// --- Status color, kept in sync with the board -------------------------------
// The board gives each status its own dot shade: to-do family = sky,
// in-progress = teal/primary, done = emerald. The board derives the shade from
// a status's position in its project's workflow, but this list shows issues
// across ALL projects (the board only does that per-project). So we make the
// shade a stable hash of the status name within its category family — every
// distinct status always gets its own color, never two same-family statuses
// colliding, and it stays consistent across reloads.
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

/** Resolve a status's Jira category from its cached category or its name. */
function categoryOf(status: string, statusCategory?: string): string {
  const c = (statusCategory || "").toLowerCase();
  if (c === "new" || c === "indeterminate" || c === "done") return c;
  const s = status.toLowerCase();
  if (/(done|resolved|closed|complete|released)/.test(s)) return "done";
  if (/(in progress|progress|doing|review|active|deploy)/.test(s)) return "indeterminate";
  return "new";
}

/**
 * Deterministic dot shade per status name within its category family (stable,
 * no hashing lib — same approach as the board's avatar palette).
 */
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

function fieldRow(label: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, key: string) {
  const b = before?.[key];
  const a = after?.[key];
  const changed = JSON.stringify(b) !== JSON.stringify(a) && a !== undefined;
  const bText = key === "labels" || key === "fixVersions" ? labelList(b) : b == null ? "—" : String(b);
  const aText = key === "labels" || key === "fixVersions" ? labelList(a) : a == null ? "—" : String(a);
  return (
    <div key={key} className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("truncate", changed && "text-muted-foreground line-through")}>{bText}</span>
      {changed && (
        <>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate font-medium text-foreground">{aText}</span>
        </>
      )}
    </div>
  );
}

export function BulkClient() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  // Load the full cache (done included) so hand-picking and filter selection both
  // see every issue on the first page. Large projects use the filter path for the
  // rest.
  const { data, isLoading } = useIssues({ includeDone: true, limit: 1000, assignee: "all" });
  const issues: IssueItem[] = useMemo(() => data?.items ?? [], [data?.items]);
  const totalInCache = data?.total ?? issues.length;

  // Distinct assignees (for autocomplete) and project keys (for filter select).
  const { data: filterOpts } = useQuery({
    queryKey: issuesKeys.filters("bulk"),
    queryFn: () =>
      api<{ assignees: string[]; labels: string[]; priorities: string[] }>("/api/issues/filters"),
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const assigneeOptions = filterOpts?.assignees ?? [];

  const availableAssignees = useMemo(() => {
    const set = new Set(assigneeOptions);
    for (const issue of issues) {
      if (issue.assigneeJira) set.add(issue.assigneeJira);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [assigneeOptions, issues]);

  const { data: projectsData } = useQuery({
    queryKey: boardKeys.projects,
    queryFn: () => api<{ items: { key: string; openCount: number }[] }>("/api/projects"),
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const projectOptions = projectsData?.items ?? [];

  // Selection mode: hand-pick specific tasks, or select everything matching a
  // project + status + assignee filter (for large runs).
  const [selectionMode, setSelectionMode] = useState<"pick" | "filter">("pick");
  const [filterProject, setFilterProject] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [taskSearch, setTaskSearch] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<string>("assign");
  const [assignee, setAssignee] = useState("");
  const [label, setLabel] = useState("");
  const [priority, setPriority] = useState("");
  const [points, setPoints] = useState("");
  const [status, setStatus] = useState("");
  const [fixVersion, setFixVersion] = useState("");
  const [comment, setComment] = useState("");
  const [branchRepo, setBranchRepo] = useState("");
  const [branchBase, setBranchBase] = useState("");
  const [branchTemplate, setBranchTemplate] = useState("{project}-{number}");
  const [branchComment, setBranchComment] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [activeOp, setActiveOp] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewView, setPreviewView] = useState<PreviewBucket>("changes");
  const [previewBasis, setPreviewBasis] = useState<string | null>(null);

  const [ops, setOps] = useState<OpListItem[]>([]);
  const [opsLoaded, setOpsLoaded] = useState(false);

  function loadOps() {
    api<{ items: OpListItem[] }>("/api/bulk/operations?limit=20")
      .then((r) => setOps(r.items))
      .catch(() => null)
      .finally(() => setOpsLoaded(true));
  }

  useEffect(loadOps, []);

  const statusOptions = useMemo(
    () => Array.from(new Set(issues.map((issue) => issue.status).filter(Boolean))).sort(),
    [issues]
  );

  const filteredIssues = useMemo(() => {
    const query = taskSearch.trim().toLowerCase();
    const myUsername = session?.user?.jiraUsername?.toLowerCase();

    return issues
      .filter((issue) => (filterProject ? issue.projectKey === filterProject : true))
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
  }, [filterProject, filterStatus, filterAssignee, issues, taskSearch, session?.user?.jiraUsername]);

  const allSelected = filteredIssues.length > 0 && filteredIssues.every((i) => selected.has(i.jiraKey));

  // The set of issue keys the action will target, depending on selection mode.
  // "pick" uses the manually-checked set. "filter" derives keys from the loaded
  // cache matching the chosen project + status (bounded by the first page); the
  // preview endpoint re-validates against the cache and reports the true count.
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

  function buildAction(): BulkAction | null {
    switch (kind) {
      case "assign":
        if (!assignee.trim()) return null;
        return { kind: "assign", value: assignee.trim() };
      case "add-labels":
      case "remove-labels": {
        const labels = label.split(",").map((s) => s.trim()).filter(Boolean);
        if (labels.length === 0) return null;
        return { kind, value: labels };
      }
      case "set-points":
        if (!points) return null;
        return { kind: "set-points", value: Number(points) };
      case "set-priority":
        if (!priority) return null;
        return { kind: "set-priority", value: priority };
      case "transition":
        if (!status.trim()) return null;
        return { kind: "transition", value: status.trim() };
      case "add-fix-version":
      case "remove-fix-version":
        if (!fixVersion.trim()) return null;
        return { kind, value: fixVersion.trim() };
      case "add-comment":
        if (!comment.trim()) return null;
        return { kind: "add-comment", value: comment.trim() };
      case "create-branches":
        return {
          kind: "create-branches",
          value: {
            repo: branchRepo.trim() || undefined,
            base: branchBase.trim() || undefined,
            nameTemplate: branchTemplate.trim() || undefined,
            comment: branchComment,
          },
        };
      default:
        return null;
    }
  }

  function resetPreview() {
    setPreview(null);
    setPreviewBasis(null);
  }

  async function doPreview() {
    const action = buildAction();
    if (!action) return;
    setPreviewing(true);
    setPreview(null);
    setActiveOp(null);
    try {
      const r = await api<Preview>("/api/issues/bulk", {
        method: "POST",
        body: { keys: effectiveKeys, action },
      });
      setPreview(r);
      setPreviewBasis(JSON.stringify({ action, keys: [...effectiveKeys].sort() }));
      setPreviewView("changes");
      setPreviewError(null);
    } catch (e) {
      setPreview(null);
      setPreviewError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  const [previewError, setPreviewError] = useState<string | null>(null);

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
    ? `${ACTION_LABELS[preview.type] ?? preview.type} (${preview.actionable} task)`
    : "Xác nhận thay đổi";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <ListChecks className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wider">Không gian làm việc Jira</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Thao tác hàng loạt</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Chọn phạm vi task, xem trước từng thay đổi, sau đó chạy an toàn dưới nền.
          </p>
        </div>
        <Badge variant={effectiveCount > 0 ? "info" : "secondary"} className="w-fit px-3 py-1">
          {effectiveCount} task trong phạm vi
        </Badge>
      </header>

      <ol aria-label="Tiến trình thao tác hàng loạt" className="grid grid-cols-3 overflow-hidden rounded-lg border bg-card">
        {[
          { number: 1, label: "Chọn task", active: true, done: effectiveCount > 0 },
          { number: 2, label: "Chọn thao tác", active: effectiveCount > 0, done: Boolean(buildAction()) },
          { number: 3, label: "Xem trước & Chạy", active: Boolean(preview), done: false },
        ].map((step) => (
          <li key={step.number} className={cn(
            "flex min-w-0 items-center gap-2 border-r px-3 py-3 text-xs last:border-r-0 sm:px-4 sm:text-sm",
            step.active && "bg-primary/5",
            !step.active && "text-muted-foreground"
          )}>
            <span className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
              step.done ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" :
                step.active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted"
            )}>
              {step.done ? <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> : step.number}
            </span>
            <span className="truncate font-medium">{step.label}</span>
          </li>
        ))}
      </ol>

      {/* Step 1 — selection */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b p-4 sm:p-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">1</span>
            Chọn danh sách task
          </CardTitle>
          <CardDescription>Chọn từng task cụ thể hoặc dùng bộ lọc để chọn tất cả task phù hợp.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
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
              <Input value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} className="pl-9" placeholder="Tìm kiếm mã task hoặc tóm tắt…" aria-label="Tìm kiếm task" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 border-b p-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Dự án</span>
                <Select value={filterProject || "ALL"} onValueChange={(v) => setFilterProject(v === "ALL" ? "" : v)}>
                  <SelectTrigger aria-label="Lọc theo dự án"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả dự án</SelectItem>
                    {projectOptions.map((p) => (
                      <SelectItem key={p.key} value={p.key}>{p.key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              <div className="flex items-center justify-between sm:col-span-3 pt-1">
                <p className="text-[11px] text-muted-foreground">
                  Đã tải {filteredIssues.length} task phù hợp.
                  {totalInCache > issues.length ? ` Đang hiển thị ${issues.length} trên tổng số ${totalInCache}; hãy thu hẹp bộ lọc trước khi chọn tất cả.` : ""}
                </p>
                {(filterProject || filterStatus || filterAssignee || taskSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterProject("");
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
            <div className="flex items-center justify-between border-b px-3 py-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                Chọn tất cả task đang hiển thị
              </label>
              <span className="text-xs text-muted-foreground">Đã chọn {selected.size}</span>
            </div>
          )}
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
              return (
                <label
                  key={i.jiraKey}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 border-b border-l-[3px] px-3 py-2 text-sm last:border-b-0 hover:bg-accent/50",
                    cat === "new" && "border-l-sky-500/60",
                    cat === "indeterminate" && "border-l-primary/60",
                    cat === "done" && "border-l-emerald-500/60",
                    (selectionMode === "filter" || selected.has(i.jiraKey)) && "bg-accent/40"
                  )}
                >
                  <Checkbox checked={selectionMode === "filter" || selected.has(i.jiraKey)} disabled={selectionMode === "filter"} onCheckedChange={() => toggle(i.jiraKey)} aria-label={`Chọn ${i.jiraKey}`} />
                  <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{i.jiraKey}</span>
                  <span className="min-w-0 flex-1 truncate">{i.summary}</span>
                  <span className="hidden sm:inline-flex shrink-0 items-center rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground max-w-[130px] truncate" title={i.assigneeJira ? `Người phụ trách: @${i.assigneeJira}` : "Chưa giao"}>
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
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted"><Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" /></span>
                <p className="text-sm font-medium">Không tìm thấy task phù hợp</p>
                <p className="mt-1 text-xs text-muted-foreground">Xóa từ khóa tìm kiếm hoặc chọn bộ lọc khác.</p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2.5 text-xs">
            <span className="text-muted-foreground">Hiển thị {filteredIssues.length}</span>
            <span className="font-medium">Đã chọn {effectiveCount}</span>
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — action */}
      <Card>
        <CardHeader className="p-4 sm:p-5">
          <CardTitle className="text-base">
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">2</span>
              Chọn thao tác
            </span>
          </CardTitle>
          <CardDescription>
            Chọn thao tác và giá trị cần đổi, sau đó xem trước các thay đổi trên {effectiveCount} task.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {ACTION_GROUPS.map((group) => (
              <fieldset key={group.label} className="rounded-lg border bg-muted/20 p-3">
                <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {group.actions.map((actionKind) => (
                    <button
                      key={actionKind}
                      type="button"
                      aria-pressed={kind === actionKind}
                      onClick={() => { setKind(actionKind); resetPreview(); }}
                      className={cn(
                        "min-h-9 cursor-pointer rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        kind === actionKind
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {actionKind === "create-branches" && <GitBranch className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
                      {ACTION_LABELS[actionKind]}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {kind === "assign" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Người phụ trách (Jira username)</span>
                <AssigneeInput value={assignee} onChange={setAssignee} options={assigneeOptions} />
              </div>
            )}
            {(kind === "add-labels" || kind === "remove-labels") && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Nhãn (phân tách bằng dấu phẩy)</span>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="release-1.4.2, frontend" />
              </div>
            )}
            {kind === "set-priority" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Độ ưu tiên</span>
                <Select value={priority} onValueChange={(v) => setPriority(v === "ALL" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Chọn độ ưu tiên" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">—</SelectItem>
                    <SelectItem value="Low">Low (Thấp)</SelectItem>
                    <SelectItem value="Medium">Medium (Trung bình)</SelectItem>
                    <SelectItem value="High">High (Cao)</SelectItem>
                    <SelectItem value="Highest">Highest (Rất cao)</SelectItem>
                    <SelectItem value="Blocker">Blocker (Nghiêm trọng)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {kind === "set-points" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Điểm story</span>
                <Select value={points} onValueChange={(v) => setPoints(v === "NONE" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Chọn điểm" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">—</SelectItem>
                    {[1, 2, 3, 5, 8, 13].map((p) => <SelectItem key={p} value={String(p)}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {kind === "transition" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Trạng thái đích</span>
                <Input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="In Progress / In Review / Done" />
              </div>
            )}
            {(kind === "add-fix-version" || kind === "remove-fix-version") && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Tên Fix Version</span>
                <Input value={fixVersion} onChange={(e) => setFixVersion(e.target.value)} placeholder="1.4.2" />
              </div>
            )}
            {kind === "add-comment" && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">Bình luận</span>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Thêm bình luận vào tất cả các task đã chọn" />
              </div>
            )}
            {kind === "create-branches" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Kho lưu trữ (project/repo)</span>
                  <Input value={branchRepo} onChange={(e) => setBranchRepo(e.target.value)} placeholder="team/app (mặc định: kho đầu tiên cấu hình)" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Nhánh gốc (Base branch)</span>
                  <Input value={branchBase} onChange={(e) => setBranchBase(e.target.value)} placeholder="main (mặc định)" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Mẫu tên nhánh — {branchTemplate}
                  </span>
                  <Input value={branchTemplate} onChange={(e) => setBranchTemplate(e.target.value)} placeholder="{project}-{number}" />
                  <span className="text-[11px] text-muted-foreground">
                    Biến thay thế: {"{issue} {project} {number} {status}"}
                  </span>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={branchComment} onCheckedChange={(v) => setBranchComment(v === true)} />
                  Ghi bình luận liên kết nhánh vào từng task
                </label>
              </>
            )}
          </div>

          {HIGH_RISK_ACTIONS.has(kind) && (
            <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              Thao tác này có thể khó hoàn tác. Hãy kiểm tra các cảnh báo và task bị chặn trước khi chạy.
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button onClick={doPreview} disabled={previewing || effectiveCount === 0 || !buildAction()}>
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

      {/* Step 3 — preview + confirm */}
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
                <span className="flex gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Danh sách chọn hoặc thao tác đã thay đổi sau khi tạo bản xem trước này.</span>
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
                <button key={bucket} type="button" aria-pressed={previewView === bucket} onClick={() => setPreviewView(bucket)}
                  className={cn("cursor-pointer rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50", previewView === bucket && "border-primary bg-primary/5")}
                >
                  <span className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{label}</span><Icon className={cn("h-4 w-4", color)} aria-hidden="true" /></span>
                  <span className="mt-1 block text-xl font-semibold">{count}</span>
                </button>
              ))}
            </div>

            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {visiblePreviewItems.map((item) => (
              <div key={item.jiraKey} className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-xs font-medium">{item.jiraKey}</span>
                  {item.warning && (
                    <Badge variant={warningVariant(item.warning)}>{item.warning.replace("_", " ")}</Badge>
                  )}
                  {item.skipReason && (
                    <Badge variant="secondary">{SKIP_LABELS[item.skipReason] ?? item.skipReason.replace("_", " ")}</Badge>
                  )}
                  {item.branchName && (
                    <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      <GitBranch className="h-3 w-3" aria-hidden />
                      {item.branchName}
                      {item.exists && <span className="text-muted-foreground">(đã tồn tại)</span>}
                    </span>
                  )}
                </div>
                {item.skipReason ? (
                  <p className="text-xs text-muted-foreground">
                    Sẽ bỏ qua: {SKIP_LABELS[item.skipReason] ?? item.skipReason.replace("_", " ")}.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-col gap-1">
                      {fieldRow("Trạng thái", item.before, item.after, "status")}
                      {fieldRow("Phụ trách", item.before, item.after, "assignee")}
                      {fieldRow("Độ ưu tiên", item.before, item.after, "priority")}
                      {fieldRow("Điểm story", item.before, item.after, "points")}
                      {fieldRow("Nhãn", item.before, item.after, "labels")}
                      {fieldRow("Fix versions", item.before, item.after, "fixVersions")}
                      {item.after.comment != null && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="w-28 shrink-0 text-muted-foreground">Bình luận</span>
                          <span className="truncate italic">“{String(item.after.comment)}”</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {visiblePreviewItems.length === 0 && (
              <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-10 text-center">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted"><CheckCircle2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" /></span>
                <p className="font-medium">Không có task nào trong nhóm này</p>
                <p className="mt-1 text-sm text-muted-foreground">Chọn một thẻ tóm tắt khác để xem các task tương ứng.</p>
              </div>
            )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
              <Button onClick={() => HIGH_RISK_ACTIONS.has(preview.type) ? setConfirmOpen(true) : void doConfirm()} disabled={confirming || preview.actionable === 0 || previewOutdated}>
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

      {/* Step 4 — operations / audit */}
      <Card>
        <CardHeader className="p-4 sm:p-5">
          <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-primary" aria-hidden="true" />Lịch sử thao tác</CardTitle>
          <CardDescription>Các thao tác hàng loạt gần đây và kết quả chi tiết từng task.</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
          {activeOp && <OperationDetail id={activeOp} />}
          {!opsLoaded ? (
            <div className="space-y-2">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-16 w-full" />)}</div>
          ) : ops.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted"><History className="h-5 w-5 text-muted-foreground" aria-hidden="true" /></span>
              <p className="font-medium">Chưa có thao tác hàng loạt nào</p>
              <p className="mt-1 text-sm text-muted-foreground">Các thao tác đã hoàn thành hoặc đang chạy sẽ xuất hiện tại đây.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {ops.map((op) => (
                <li key={op.id} className={cn("rounded-lg border p-3 transition-colors", activeOp === op.id && "border-primary bg-primary/[0.03]")}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button type="button" onClick={() => setActiveOp(op.id)} className="min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant={stateVariant(op.state)}>{op.state.replace("_", " ")}</Badge>
                        <span className="font-medium">{ACTION_LABELS[op.type] ?? op.type}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">#{op.id.slice(0, 8)}</span>
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{op.succeeded}/{op.total} thành công · {op.failed} thất bại · {formatTime(op.completedAt ?? op.createdAt)}</span>
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

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-600" aria-hidden="true" />Xác nhận thao tác có mức độ ảnh hưởng lớn</DialogTitle>
            <DialogDescription>
              Bạn sắp thực hiện “{preview ? ACTION_LABELS[preview.type] ?? preview.type : "thao tác này"}” trên {preview?.actionable ?? 0} task. Thao tác này có thể khó hoàn tác và sẽ gửi thông báo đến những người theo dõi trên Jira.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">Trước khi tiếp tục</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Kiểm tra kỹ các nhóm có cảnh báo và bị chặn.</li>
              <li>Các task đã xử lý thành công sẽ không tự động hoàn tác.</li>
            </ul>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Quay lại</Button>
            <Button onClick={() => { setConfirmOpen(false); void doConfirm(); }} disabled={confirming}>{confirmLabel}</Button>
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
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
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

function OperationDetail({ id }: { id: string }) {
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
            <span className="font-mono text-xs">{it.jiraKey}</span>
            {it.attemptCount > 1 && <span className="text-[11px] text-muted-foreground">({it.attemptCount} lần thử)</span>}
            {it.error && <span className="truncate text-xs text-red-500">{it.error}</span>}
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
