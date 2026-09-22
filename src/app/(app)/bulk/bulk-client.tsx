"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useIssues, type IssueItem } from "@/hooks/use-issues";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
  Loader2,
  Eye,
  GitBranch,
  ArrowRight,
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
  transitionName: string | null;
  branchName: string | null;
  exists: boolean;
};

type Preview = {
  operationId: string;
  type: string;
  total: number;
  actionable: number;
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
  assign: "Assign to",
  "add-labels": "Add labels",
  "remove-labels": "Remove labels",
  "set-points": "Set points",
  "set-priority": "Set priority",
  transition: "Move to status",
  "add-fix-version": "Add fix version",
  "remove-fix-version": "Remove fix version",
  "add-comment": "Add comment",
  "create-branches": "Create branches",
};

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
  // Load the full cache (done included) so hand-picking and filter selection both
  // see every issue on the first page. Large projects use the filter path for the
  // rest.
  const { data, isLoading } = useIssues({ includeDone: true, limit: 1000 });
  const issues: IssueItem[] = data?.items ?? [];
  const totalInCache = data?.total ?? issues.length;

  // Distinct assignees (for autocomplete) and project keys (for filter select).
  const { data: filterOpts } = useQuery({
    queryKey: ["issues", "filters", "bulk"],
    queryFn: () =>
      api<{ assignees: string[]; labels: string[]; priorities: string[] }>("/api/issues/filters"),
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const assigneeOptions = filterOpts?.assignees ?? [];

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ items: { key: string; openCount: number }[] }>("/api/projects"),
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const projectOptions = projectsData?.items ?? [];

  // Selection mode: hand-pick specific tasks, or select everything matching a
  // project + status filter (for large runs).
  const [selectionMode, setSelectionMode] = useState<"pick" | "filter">("pick");
  const [filterProject, setFilterProject] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

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

  const [ops, setOps] = useState<OpListItem[]>([]);
  const [opsLoaded, setOpsLoaded] = useState(false);

  function loadOps() {
    api<{ items: OpListItem[] }>("/api/bulk/operations?limit=20")
      .then((r) => setOps(r.items))
      .catch(() => null)
      .finally(() => setOpsLoaded(true));
  }

  useEffect(loadOps, []);

  const allSelected = issues.length > 0 && issues.every((i) => selected.has(i.jiraKey));

  // The set of issue keys the action will target, depending on selection mode.
  // "pick" uses the manually-checked set. "filter" derives keys from the loaded
  // cache matching the chosen project + status (bounded by the first page); the
  // preview endpoint re-validates against the cache and reports the true count.
  const effectiveKeys: string[] =
    selectionMode === "filter"
      ? issues
          .filter((i) => (filterProject ? i.projectKey === filterProject : true))
          .filter((i) => (filterStatus ? i.status === filterStatus : true))
          .map((i) => i.jiraKey)
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
    setSelected(allSelected ? new Set() : new Set(issues.map((i) => i.jiraKey)));
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
      qc.invalidateQueries({ queryKey: ["issues"] });
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

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Bulk edit</h1>
        <p className="text-sm text-muted-foreground">
          Select tasks, choose an action, preview the changes, then confirm. Large runs are
          processed in the background so they never time out.
        </p>
      </div>

      {/* Step 1 — selection */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectionMode("pick")}
                className={cn(
                  "cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  selectionMode === "pick"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/50"
                )}
              >
                Pick tasks
              </button>
              <button
                type="button"
                onClick={() => setSelectionMode("filter")}
                className={cn(
                  "cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  selectionMode === "filter"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/50"
                )}
              >
                Select by filter
              </button>
            </div>
            <span className="text-xs text-muted-foreground">
              {effectiveCount} task{effectiveCount === 1 ? "" : "s"} selected
            </span>
          </div>

          {selectionMode === "filter" && (
            <div className="grid grid-cols-1 gap-2 border-b p-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Project</span>
                <Select value={filterProject || "ALL"} onValueChange={(v) => setFilterProject(v === "ALL" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All projects</SelectItem>
                    {projectOptions.map((p) => (
                      <SelectItem key={p.key} value={p.key}>{p.key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Status</span>
                <Input value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} placeholder="e.g. In Progress (blank = any)" />
              </div>
              <p className="text-[11px] text-muted-foreground sm:col-span-2">
                Applies to {effectiveCount} of {totalInCache} cached issue{totalInCache === 1 ? "" : "s"}
                {totalInCache > issues.length ? " (showing first page only — use a project to narrow)" : ""}.
              </p>
            </div>
          )}

          {selectionMode === "pick" && (
            <div className="flex items-center justify-between border-b px-3 py-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                Select all
              </label>
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            </div>
          )}
          <div className={cn("max-h-72 overflow-y-auto", selectionMode === "filter" && "hidden")}>
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
            {issues.map((i) => (
              <label
                key={i.jiraKey}
                className={cn(
                  "flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-0 hover:bg-accent/50",
                  selected.has(i.jiraKey) && "bg-accent/40"
                )}
              >
                <Checkbox checked={selected.has(i.jiraKey)} onCheckedChange={() => toggle(i.jiraKey)} />
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{i.jiraKey}</span>
                <span className="flex-1 truncate">{i.summary}</span>
                <Badge variant="secondary" className="shrink-0">{i.status}</Badge>
                {i.points != null && <Badge variant="outline" className="shrink-0">{i.points}pt</Badge>}
              </label>
            ))}
            {!isLoading && issues.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">No issues in cache.</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — action */}
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">2</span>
              Action
            </span>
          </CardTitle>
          <CardDescription>
            Choose one action and its value, then preview what will change on {effectiveCount} task(s).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {Object.keys(ACTION_LABELS).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  resetPreview();
                }}
                className={cn(
                  "cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors",
                  kind === k
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/50"
                )}
              >
                {k === "create-branches" && <GitBranch className="mr-1 inline h-3.5 w-3.5" aria-hidden />}
                {ACTION_LABELS[k]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {kind === "assign" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Assignee (Jira username)</span>
                <AssigneeInput value={assignee} onChange={setAssignee} options={assigneeOptions} />
              </div>
            )}
            {(kind === "add-labels" || kind === "remove-labels") && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Labels (comma-separated)</span>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="release-1.4.2, frontend" />
              </div>
            )}
            {kind === "set-priority" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Priority</span>
                <Select value={priority} onValueChange={(v) => setPriority(v === "ALL" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">—</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Highest">Highest</SelectItem>
                    <SelectItem value="Blocker">Blocker</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {kind === "set-points" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Points</span>
                <Select value={points} onValueChange={(v) => setPoints(v === "NONE" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Points" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">—</SelectItem>
                    {[1, 2, 3, 5, 8, 13].map((p) => <SelectItem key={p} value={String(p)}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {kind === "transition" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Target status</span>
                <Input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="In Progress / In Review / Done" />
              </div>
            )}
            {(kind === "add-fix-version" || kind === "remove-fix-version") && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Fix version name</span>
                <Input value={fixVersion} onChange={(e) => setFixVersion(e.target.value)} placeholder="1.4.2" />
              </div>
            )}
            {kind === "add-comment" && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">Comment</span>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment to every selected task" />
              </div>
            )}
            {kind === "create-branches" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Repository (project/repo)</span>
                  <Input value={branchRepo} onChange={(e) => setBranchRepo(e.target.value)} placeholder="team/app (default: first configured)" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Base branch</span>
                  <Input value={branchBase} onChange={(e) => setBranchBase(e.target.value)} placeholder="main (default)" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Branch name template — {branchTemplate}
                  </span>
                  <Input value={branchTemplate} onChange={(e) => setBranchTemplate(e.target.value)} placeholder="{project}-{number}" />
                  <span className="text-[11px] text-muted-foreground">
                    Placeholders: {"{issue} {project} {number} {status}"}
                  </span>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={branchComment} onCheckedChange={(v) => setBranchComment(v === true)} />
                  Comment the branch link onto each task
                </label>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={doPreview} disabled={previewing || effectiveCount === 0 || !buildAction()}>
              {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Preview changes
            </Button>
            {previewError && (
              <span className="flex items-center gap-1 text-sm text-red-500">
                <TriangleAlert className="h-4 w-4" aria-hidden />
                {previewError}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 3 — preview + confirm */}
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">3</span>
                Review preview
              </span>
            </CardTitle>
            <CardDescription>
              {preview.actionable} of {preview.total} task(s) will be changed. No changes are made until you confirm.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {preview.items.map((item) => (
              <div key={item.jiraKey} className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-xs font-medium">{item.jiraKey}</span>
                  {item.warning && (
                    <Badge variant={item.warning === "stale_data" ? "warning" : "danger"}>{item.warning.replace("_", " ")}</Badge>
                  )}
                  {item.branchName && (
                    <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      <GitBranch className="h-3 w-3" aria-hidden />
                      {item.branchName}
                      {item.exists && <span className="text-muted-foreground">(exists)</span>}
                    </span>
                  )}
                </div>
                {item.warning === "not_in_cache" ? (
                  <p className="text-xs text-muted-foreground">Not in cache — will be skipped.</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-col gap-1">
                      {fieldRow("Status", item.before, item.after, "status")}
                      {fieldRow("Assignee", item.before, item.after, "assignee")}
                      {fieldRow("Priority", item.before, item.after, "priority")}
                      {fieldRow("Points", item.before, item.after, "points")}
                      {fieldRow("Labels", item.before, item.after, "labels")}
                      {fieldRow("Fix versions", item.before, item.after, "fixVersions")}
                      {item.after.comment != null && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="w-28 shrink-0 text-muted-foreground">Comment</span>
                          <span className="truncate italic">“{String(item.after.comment)}”</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="flex items-center gap-3 pt-1">
              <Button onClick={doConfirm} disabled={confirming || preview.actionable === 0} className="bg-accent hover:bg-accent/90">
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                Confirm & run ({preview.actionable})
              </Button>
              <Button variant="ghost" onClick={doCancelPreview}>
                <X className="h-4 w-4" aria-hidden /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4 — operations / audit */}
      <Card>
        <CardHeader>
          <CardTitle>Operations</CardTitle>
          <CardDescription>Recent bulk operations and their per-item results.</CardDescription>
        </CardHeader>
        <CardContent>
          {activeOp && <OperationDetail id={activeOp} />}
          {!opsLoaded ? (
            <Skeleton className="h-12 w-full" />
          ) : ops.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No bulk operations yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ops.map((op) => (
                <li key={op.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                  <Badge variant={stateVariant(op.state)}>{op.state.replace("_", " ")}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{op.id.slice(0, 8)}</span>
                  <span className="text-sm">{ACTION_LABELS[op.type] ?? op.type}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {op.succeeded}/{op.total} ok · {op.failed} failed
                  </span>
                  <span className="text-xs text-muted-foreground">{formatTime(op.completedAt ?? op.createdAt)}</span>
                  {["completed", "partially_failed", "failed"].includes(op.state) && op.failed > 0 && (
                    <Button size="sm" variant="outline" onClick={() => doRetry(op.id)}>
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
        <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {matches.map((opt, i) => (
            <li key={opt}>
              <button
                type="button"
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
    queryKey: ["bulk-op", id],
    queryFn: () => api<OpDetail>(`/api/bulk/operations/${id}`),
    refetchInterval: (query) =>
      ["running", "queued"].includes(query.state.data?.operation.state ?? "") ? 2000 : false,
  });
  const op = data?.operation;

  if (!op) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-md border border-border p-3 text-sm">
        {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Loading operation…
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
          {done}/{op.total} done
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
            {it.attemptCount > 1 && <span className="text-[11px] text-muted-foreground">({it.attemptCount} tries)</span>}
            {it.error && <span className="truncate text-xs text-red-500">{it.error}</span>}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden /> Refresh
        </Button>
      </div>
    </div>
  );
}
