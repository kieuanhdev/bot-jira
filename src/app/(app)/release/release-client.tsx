"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { releasesKeys } from "@/lib/query-keys";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { timeAgo } from "@/lib/utils";
import {
  Rocket,
  ShieldCheck,
  ShieldAlert,
  Plus,
  PackageOpen,
  Tag,
  Send,
  Network,
  Layers,
  Filter,
  RefreshCw,
  CornerDownRight,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ReleaseTask = {
  jiraKey: string;
  projectKey?: string;
  issue: {
    status: string;
    statusCategory: string;
    summary: string;
    points: number | null;
    priority: string;
    fixVersions?: string[];
  };
  inclusion?: "direct" | "dependency";
  rootKeys?: string[];
  depth?: number;
  sameProject?: boolean;
  hasReleaseVersion?: boolean;
};

export type DependencyGraph = {
  nodes: Array<{ key: string; status: string; statusCategory: string; points: number | null; summary: string }>;
  edges: Array<{ inwardKey: string; outwardKey: string; type: string }>;
  missingKeys: string[];
  cycles: string[][];
  truncated: boolean;
};

type Task = {
  jiraKey: string;
  issue: {
    status: string;
    statusCategory: string;
    summary: string;
    points: number | null;
    priority: string;
  };
};
type JiraVersion = { id: string; name: string; released?: boolean };
type GateBlocker = { jiraKey?: string; source?: string; reason: string; url?: string };
type GateResult = {
  gate: string;
  state: "passed" | "failed" | "unknown" | "overridden";
  summary: string;
  blockers: GateBlocker[];
  sourceTime?: string;
  details?: Record<string, unknown>;
};
type Release = {
  id: string;
  version: string;
  projectKey: string;
  jiraVersionId?: string | null;
  targetLabel: string;
  status: "draft" | "checking" | "ready" | "blocked" | "unknown" | "released";
  notes: string;
  createdAt: string;
  releasedAt?: string | null;
  tasks: Task[];
};

type ReleaseCheckState = {
  ready: boolean;
  status: string;
  blockers: GateBlocker[];
  gates: GateResult[];
  tasks?: ReleaseTask[];
  dependencyGraph?: DependencyGraph;
};

const DONE_CATEGORIES = ["done"];

const GATE_LABELS: Record<string, string> = {
  non_empty_release: "Bản phát hành không rỗng",
  task_status: "Trạng thái task",
  critical_bugs: "Lỗi nghiêm trọng (Critical bugs)",
  sentry: "Lỗi Sentry",
  branches: "Trạng thái nhánh",
  pull_requests: "Pull Request",
  data_freshness: "Độ tươi mới dữ liệu",
  ci: "CI Build",
  manual_approval: "Phê duyệt thủ công",
  ai_advisory: "Tư vấn AI",
  dependency_version_consistency: "Nhất quán Fix Version dependency",
  dependency_graph_integrity: "Toàn vẹn đồ thị dependency",
};

const STATUS_LABELS: Record<Release["status"], string> = {
  draft: "Bản nháp",
  checking: "Đang kiểm tra",
  ready: "Sẵn sàng",
  blocked: "Bị chặn",
  unknown: "Chưa rõ",
  released: "Đã phát hành",
};

const GATE_STATE_LABELS: Record<GateResult["state"], string> = {
  passed: "Đạt",
  failed: "Thất bại",
  unknown: "Chưa rõ",
  overridden: "Bỏ qua",
};

function gateVariant(state: GateResult["state"]): "success" | "danger" | "warning" | "secondary" {
  switch (state) {
    case "passed":
    case "overridden":
      return "success";
    case "failed":
      return "danger";
    case "unknown":
      return "warning";
    default:
      return "secondary";
  }
}

function gateLabel(gate: string): string {
  return GATE_LABELS[gate] ?? gate;
}

function StatusBadge({ status }: { status: Release["status"] }) {
  const map: Record<Release["status"], "secondary" | "success" | "danger" | "info" | "warning"> = {
    draft: "secondary",
    checking: "secondary",
    ready: "success",
    blocked: "danger",
    unknown: "warning",
    released: "info",
  };
  return <Badge variant={map[status] ?? "secondary"}>{STATUS_LABELS[status] ?? status}</Badge>;
}

function isTaskBlocked(t: ReleaseTask, blockers: GateBlocker[]): boolean {
  if (!DONE_CATEGORIES.includes(t.issue.statusCategory)) return true;
  if (t.hasReleaseVersion === false) return true;
  if (blockers.some((b) => b.jiraKey === t.jiraKey)) return true;
  return false;
}

export function ReleaseClient() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [linkVersionId, setLinkVersionId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [versions, setVersions] = useState<JiraVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Record<string, ReleaseCheckState>>({});

  // View state per release
  const [viewModes, setViewModes] = useState<Record<string, "tree" | "flat">>({});
  const [filterBlockersOnly, setFilterBlockersOnly] = useState<Record<string, boolean>>({});

  // Fix Version Sync Modal state
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncRel, setSyncRel] = useState<Release | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncConfirming, setSyncConfirming] = useState(false);
  const [syncPreview, setSyncPreview] = useState<{
    operationId: string;
    total: number;
    actionable: number;
    skipped: number;
    items: Array<{ jiraKey: string; actionable: boolean; reason?: string }>;
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function openSyncDialog(rel: Release) {
    setSyncRel(rel);
    setSyncOpen(true);
    setSyncLoading(true);
    setSyncPreview(null);
    setSyncError(null);

    try {
      const directKeys = rel.tasks.map((t) => t.jiraKey);
      const res = await api<{
        operationId: string;
        total: number;
        actionable: number;
        skipped: number;
        items: Array<{ jiraKey: string; actionable: boolean; reason?: string }>;
      }>("/api/issues/bulk", {
        method: "POST",
        body: {
          action: {
            kind: "add-fix-version",
            version: rel.version,
            dependencyScope: "recursive",
          },
          keys: directKeys,
        },
      });
      setSyncPreview(res);
    } catch (e) {
      setSyncError((e as Error).message || "Không thể tải trước thông tin đồng bộ.");
    } finally {
      setSyncLoading(false);
    }
  }

  async function confirmSync() {
    if (!syncPreview || !syncRel) return;
    setSyncConfirming(true);
    setSyncError(null);
    try {
      await api("/api/issues/bulk", {
        method: "POST",
        body: {
          confirm: true,
          operationId: syncPreview.operationId,
        },
      });
      setSyncOpen(false);
      // Re-trigger ready check to show fresh gate statuses
      setTimeout(() => {
        checkReady(syncRel.id);
      }, 1500);
    } catch (e) {
      setSyncError((e as Error).message || "Không thể thực hiện đồng bộ.");
    } finally {
      setSyncConfirming(false);
    }
  }

  // REL-02 — release a release only when its latest ready-check is ready.
  async function publishRelease(rel: Release) {
    if (releasingId) return; // double-click guard
    setReleaseError(null);
    const ok = window.confirm(
      `Phát hành ${rel.projectKey} v${rel.version}?\n\n` +
        `Task: ${rel.tasks.filter((t) => DONE_CATEGORIES.includes(t.issue.statusCategory)).length}/${rel.tasks.length} hoàn thành\n` +
        "Thao tác này sẽ đánh dấu Jira Fix Version là đã phát hành. Hành động này không thể hoàn tác dễ dàng."
    );
    if (!ok) return;
    setReleasingId(rel.id);
    try {
      const r = await api<{ ok: boolean; already?: boolean; error?: string }>(
        `/api/releases/${rel.id}/release`,
        { method: "POST", body: {} }
      );
      if (!r.ok) setReleaseError(r.error ?? "Phát hành thất bại");
      qc.invalidateQueries({ queryKey: releasesKeys.all });
    } catch (e) {
      setReleaseError((e as Error).message);
    } finally {
      setReleasingId(null);
    }
  }

  const { data } = useQuery({
    queryKey: releasesKeys.all,
    queryFn: () => api<{ items: Release[] }>("/api/releases"),
    refetchInterval: 30000,
    retry: 1,
  });

  async function loadVersions(key: string) {
    if (!key) {
      setVersions([]);
      return;
    }
    setVersionsLoading(true);
    setVersions([]);
    try {
      const r = await api<{ items: Release[] }>(`/api/releases?projectKey=${encodeURIComponent(key)}`);
      const first = r.items?.find((rel) => rel.projectKey === key);
      if (first) {
        const v = await api<{ items: JiraVersion[] }>(`/api/releases/${first.id}/versions`);
        setVersions(v.items ?? []);
      }
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function createRelease() {
    if (!version.trim()) return;
    const body: Record<string, string> = { version: version.trim() };
    if (projectKey.trim()) {
      body.projectKey = projectKey.trim().toUpperCase();
      if (description.trim()) body.description = description.trim();
      if (linkVersionId) body.jiraVersionId = linkVersionId;
    }
    await api("/api/releases", { method: "POST", body });
    setVersion("");
    setProjectKey("");
    setLinkVersionId("");
    setDescription("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: releasesKeys.all });
  }

  async function checkReady(id: string) {
    setCheckingId(id);
    try {
      const r = await api<{
        ready: boolean;
        status: string;
        blockers: GateBlocker[];
        gates: GateResult[];
        tasks?: ReleaseTask[];
        dependencyGraph?: DependencyGraph;
      }>(`/api/releases/${id}/ready`, { method: "POST", body: {} });
      setLastCheck((prev) => ({
        ...prev,
        [id]: {
          ready: r.ready,
          status: r.status,
          blockers: r.blockers ?? [],
          gates: r.gates ?? [],
          tasks: r.tasks,
          dependencyGraph: r.dependencyGraph,
        },
      }));
    } finally {
      setCheckingId(null);
    }
    qc.invalidateQueries({ queryKey: releasesKeys.all });
  }

  const releases = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Phát hành</h1>
          <p className="text-sm text-muted-foreground">
            Gộp task theo nhãn phát hành hoặc Fix Version, sau đó chạy kiểm tra sẵn sàng phát hành.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5 cursor-pointer"><Plus className="h-4 w-4" /> Tạo bản phát hành</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tạo bản phát hành mới</DialogTitle>
              <DialogDescription>
                Bản phát hành được liên kết với một Jira Fix Version. Các task có Fix Version
                này sẽ được gộp vào. Để trống “Liên kết Fix Version” nếu muốn tạo
                mới Fix Version trên Jira.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="version">Phiên bản</Label>
                <Input id="version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.4.2" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="projectKey">Dự án Jira</Label>
                <Input
                  id="projectKey"
                  value={projectKey}
                  onChange={(e) => {
                    const next = e.target.value.toUpperCase();
                    setProjectKey(next);
                    setLinkVersionId("");
                    loadVersions(next.trim());
                  }}
                  placeholder="EPM"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="linkVersion">Liên kết Fix Version</Label>
                {projectKey.trim() ? (
                  versions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {versionsLoading ? "Đang tải…" : "Chưa có Fix Version nào — một phiên bản mới sẽ được tạo."}
                    </p>
                  ) : (
                    <Select
                      value={linkVersionId}
                      onValueChange={setLinkVersionId}
                    >
                      <SelectTrigger id="linkVersion">
                        <SelectValue placeholder="Tạo một Fix Version mới" />
                      </SelectTrigger>
                      <SelectContent>
                        {versions.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                            {v.released ? " (đã phát hành)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">Chọn một dự án để liên kết Fix Version có sẵn.</p>
                )}
              </div>
              {projectKey.trim() && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="description">Mô tả</Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Mô tả tuỳ chọn cho Fix Version"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={createRelease} disabled={!version.trim() || versionsLoading} className="cursor-pointer">
                Tạo mới
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {releases.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <PackageOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Chưa có bản phát hành nào</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Tạo bản phát hành gắn với Jira Fix Version, sau đó chạy kiểm tra sẵn sàng phát hành (ready-check).
            </p>
          </CardContent>
        </Card>
      )}

      {releases.map((rel) => {
        const check = lastCheck[rel.id];
        const allTasks: ReleaseTask[] =
          check?.tasks && check.tasks.length > 0
            ? check.tasks
            : rel.tasks.map((t) => ({
                ...t,
                inclusion: "direct" as const,
                depth: 0,
                sameProject: true,
                hasReleaseVersion: true,
                rootKeys: [t.jiraKey],
              }));

        const doneCount = allTasks.filter((t) => DONE_CATEGORIES.includes(t.issue.statusCategory)).length;
        const directTasks = allTasks.filter((t) => t.inclusion !== "dependency");
        const dependencyTasks = allTasks.filter((t) => t.inclusion === "dependency");

        // Missing dependency versions condition for repair action
        const hasMissingDependencyVersions = Boolean(
          dependencyTasks.some((t) => t.sameProject !== false && t.hasReleaseVersion === false) ||
            check?.gates.some(
              (g) => g.gate === "dependency_version_consistency" && (g.state === "failed" || g.state === "unknown")
            )
        );

        const currentView = viewModes[rel.id] ?? "tree";
        const currentFilterBlockers = filterBlockersOnly[rel.id] ?? false;

        const blockersList = check?.blockers ?? [];

        // Filter tasks if filterBlockersOnly is active
        const filterFn = (t: ReleaseTask) => !currentFilterBlockers || isTaskBlocked(t, blockersList);

        return (
          <Card key={rel.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  <CardTitle className="text-lg">v{rel.version}</CardTitle>
                  <StatusBadge status={rel.status} />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={checkingId === rel.id}
                    onClick={() => checkReady(rel.id)}
                    className="gap-1.5 cursor-pointer"
                  >
                    {check?.ready ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <ShieldAlert className="h-4 w-4" />}
                    {checkingId === rel.id ? "Đang kiểm tra…" : "Kiểm tra sẵn sàng"}
                  </Button>
                  {rel.status !== "released" && check?.ready && (
                    <Button
                      size="sm"
                      disabled={releasingId === rel.id}
                      onClick={() => publishRelease(rel)}
                      className="gap-1.5 cursor-pointer"
                    >
                      <Send className="h-4 w-4" />
                      {releasingId === rel.id ? "Đang phát hành…" : "Phát hành phiên bản"}
                    </Button>
                  )}
                </div>
              </div>
              <CardDescription className="flex items-center gap-1.5">
                {rel.projectKey ? (
                  <span className="inline-flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" />
                    <code className="rounded bg-muted px-1 text-xs">{rel.projectKey}</code>
                    {rel.jiraVersionId ? (
                      <span className="text-xs text-muted-foreground">fix version</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" />
                    <code className="rounded bg-muted px-1 text-xs">{rel.targetLabel}</code>
                  </span>
                )}
                <span>·</span>
                <span>
                  {doneCount}/{allTasks.length} hoàn thành
                </span>
                {dependencyTasks.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-xs text-muted-foreground">
                      ({directTasks.length} trực tiếp, {dependencyTasks.length} phụ thuộc)
                    </span>
                  </>
                )}
                <span>·</span>
                <span>{timeAgo(rel.createdAt)}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {releaseError && (
                <div className="rounded-md border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
                  Phát hành thất bại: {releaseError}
                </div>
              )}
              {rel.status === "released" && (
                <div className="rounded-md border border-sky-300/40 bg-sky-500/10 p-3 text-sm text-sky-700 dark:text-sky-400">
                  Đã phát hành{rel.releasedAt ? ` ${timeAgo(rel.releasedAt)}` : ""}.
                </div>
              )}
              {check && (
                <div
                  className={
                    "rounded-md border p-3 text-sm " +
                    (check.ready
                      ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "border-red-300/40 bg-red-500/10")
                  }
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">
                      {check.ready ? "Sẵn sàng phát hành" : `Chưa sẵn sàng (${check.status})`}
                    </p>
                    {hasMissingDependencyVersions && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openSyncDialog(rel)}
                        className="gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 text-xs h-7 cursor-pointer"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Đồng bộ version xuống dependency
                      </Button>
                    )}
                  </div>
                  {check.gates.length > 0 && (
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                      {check.gates.map((g, i) => (
                        <div
                          key={`${g.gate}-${i}`}
                          className="flex items-start gap-2 rounded-md border border-border/60 bg-background/50 px-2.5 py-1.5 transition-colors"
                        >
                          <Badge variant={gateVariant(g.state)} className="mt-0.5 shrink-0 text-[10px]">
                            {GATE_STATE_LABELS[g.state] ?? g.state}
                          </Badge>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-foreground">
                              {gateLabel(g.gate)}
                            </p>
                            <p className="truncate text-xs text-muted-foreground" title={g.summary}>
                              {g.summary}
                            </p>
                            {g.blockers.length > 0 && (
                              <ul className="mt-0.5 list-inside list-disc text-xs text-muted-foreground">
                                {g.blockers.slice(0, 3).map((b, j) => (
                                  <li key={j} className="truncate" title={b.reason}>
                                    {b.jiraKey ? `${b.jiraKey}: ${b.reason}` : b.reason}
                                  </li>
                                ))}
                                {g.blockers.length > 3 && (
                                  <li className="text-muted-foreground/70">
                                    +{g.blockers.length - 3} mục khác
                                  </li>
                                )}
                              </ul>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tasks Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Danh sách task ({allTasks.length})
                  </span>
                  {dependencyTasks.length > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      {dependencyTasks.length} dependencies
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant={currentFilterBlockers ? "secondary" : "ghost"}
                    onClick={() =>
                      setFilterBlockersOnly((prev) => ({ ...prev, [rel.id]: !prev[rel.id] }))
                    }
                    className="h-7 gap-1 px-2 text-xs cursor-pointer"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    Chỉ task chặn / lỗi
                  </Button>
                  {dependencyTasks.length > 0 && (
                    <div className="flex items-center rounded-md border border-border p-0.5">
                      <button
                        type="button"
                        onClick={() => setViewModes((prev) => ({ ...prev, [rel.id]: "tree" }))}
                        className={`flex items-center gap-1 rounded px-2 py-1 text-xs cursor-pointer transition-colors ${
                          currentView === "tree"
                            ? "bg-accent font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        title="Xem dạng cây"
                      >
                        <Network className="h-3.5 w-3.5" />
                        Dạng cây
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewModes((prev) => ({ ...prev, [rel.id]: "flat" }))}
                        className={`flex items-center gap-1 rounded px-2 py-1 text-xs cursor-pointer transition-colors ${
                          currentView === "flat"
                            ? "bg-accent font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        title="Xem danh sách phẳng"
                      >
                        <Layers className="h-3.5 w-3.5" />
                        Phẳng
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Tree View Mode */}
              {currentView === "tree" && (
                <div className="flex flex-col gap-3">
                  {directTasks.filter(filterFn).length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      Không có task nào khớp bộ lọc.
                    </p>
                  )}
                  {directTasks.filter(filterFn).map((root) => {
                    const deps = dependencyTasks.filter(
                      (d) => d.rootKeys?.includes(root.jiraKey) && filterFn(d)
                    );
                    const rootIsBlocked = isTaskBlocked(root, blockersList);

                    return (
                      <div
                        key={root.jiraKey}
                        className={`rounded-lg border p-3 transition-colors ${
                          rootIsBlocked
                            ? "border-amber-500/30 bg-amber-500/5"
                            : "border-border/60 bg-card"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/issue/${root.jiraKey}`}
                              className="font-mono text-xs font-semibold text-primary hover:underline"
                            >
                              {root.jiraKey}
                            </Link>
                            <Badge variant="secondary" className="text-[10px] font-semibold">
                              Task lớn
                            </Badge>
                            <span className="line-clamp-1 text-sm font-medium text-foreground">
                              {root.issue.summary}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge
                              variant={
                                DONE_CATEGORIES.includes(root.issue.statusCategory)
                                  ? "success"
                                  : "secondary"
                              }
                            >
                              {root.issue.status}
                            </Badge>
                            <span className="font-mono text-xs text-muted-foreground">
                              {root.issue.points ?? "—"} pts
                            </span>
                          </div>
                        </div>

                        {/* Indented Dependencies */}
                        {deps.length > 0 && (
                          <div className="mt-3 flex flex-col gap-2 border-l-2 border-border/60 pl-3">
                            {deps.map((dep) => {
                              const depBlocked = isTaskBlocked(dep, blockersList);
                              return (
                                <div
                                  key={dep.jiraKey}
                                  className={`flex items-start justify-between gap-3 rounded-md px-2 py-1.5 text-xs transition-colors ${
                                    depBlocked
                                      ? "bg-amber-500/10 border border-amber-500/20"
                                      : "bg-muted/30 hover:bg-muted/50"
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                                    <Link
                                      href={`/issue/${dep.jiraKey}`}
                                      className="font-mono font-medium hover:underline text-foreground"
                                    >
                                      {dep.jiraKey}
                                    </Link>
                                    <Badge variant="outline" className="text-[10px]">
                                      Cấp {dep.depth ?? 1}
                                    </Badge>
                                    {dep.sameProject === false && (
                                      <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                                        Project khác ({dep.projectKey || dep.jiraKey.split("-")[0]})
                                      </Badge>
                                    )}
                                    {dep.hasReleaseVersion === false && (
                                      <Badge variant="danger" className="text-[10px]">
                                        Thiếu version
                                      </Badge>
                                    )}
                                    {!DONE_CATEGORIES.includes(dep.issue.statusCategory) && (
                                      <Badge variant="warning" className="text-[10px]">
                                        Chưa xong
                                      </Badge>
                                    )}
                                    <span className="line-clamp-1 text-muted-foreground">
                                      {dep.issue.summary}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Badge
                                      variant={
                                        DONE_CATEGORIES.includes(dep.issue.statusCategory)
                                          ? "success"
                                          : "secondary"
                                      }
                                      className="text-[10px]"
                                    >
                                      {dep.issue.status}
                                    </Badge>
                                    <span className="font-mono text-[10px] text-muted-foreground">
                                      {dep.issue.points ?? "—"} pts
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Flat View Mode */}
              {currentView === "flat" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2">Task</th>
                        <th>Phân loại</th>
                        <th>Tóm tắt</th>
                        <th>Cảnh báo</th>
                        <th>Trạng thái</th>
                        <th>Điểm</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {allTasks.filter(filterFn).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-xs text-muted-foreground">
                            Không có task nào khớp bộ lọc.
                          </td>
                        </tr>
                      ) : (
                        allTasks.filter(filterFn).map((t) => {
                          const isDep = t.inclusion === "dependency";
                          return (
                            <tr key={t.jiraKey} className="hover:bg-muted/20">
                              <td className="py-2">
                                <Link
                                  href={`/issue/${t.jiraKey}`}
                                  className="font-mono text-xs font-semibold hover:underline"
                                >
                                  {t.jiraKey}
                                </Link>
                              </td>
                              <td>
                                {isDep ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    Cấp {t.depth ?? 1}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Task lớn
                                  </Badge>
                                )}
                              </td>
                              <td className="line-clamp-1 max-w-xs">{t.issue.summary}</td>
                              <td>
                                <div className="flex flex-wrap gap-1">
                                  {t.sameProject === false && (
                                    <Badge variant="secondary" className="text-[10px]">
                                      Project khác
                                    </Badge>
                                  )}
                                  {t.hasReleaseVersion === false && (
                                    <Badge variant="danger" className="text-[10px]">
                                      Thiếu version
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td>
                                <Badge
                                  variant={
                                    DONE_CATEGORIES.includes(t.issue.statusCategory)
                                      ? "success"
                                      : "secondary"
                                  }
                                >
                                  {t.issue.status}
                                </Badge>
                              </td>
                              <td className="font-mono text-xs">{t.issue.points ?? "—"}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Sync Fix Version Dialog */}
      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Đồng bộ Fix Version xuống dependency
            </DialogTitle>
            <DialogDescription>
              Tự động thêm Fix Version <strong>v{syncRel?.version}</strong> vào các dependency cùng dự án (
              {syncRel?.projectKey}) đang bị thiếu version.
            </DialogDescription>
          </DialogHeader>

          {syncLoading && (
            <div className="flex flex-col gap-2 py-4">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {syncError && (
            <div className="rounded-md border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
              {syncError}
            </div>
          )}

          {!syncLoading && syncPreview && (
            <div className="flex flex-col gap-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="secondary" className="px-2 py-1">
                  Tổng duyệt: {syncPreview.total}
                </Badge>
                <Badge variant="success" className="px-2 py-1">
                  Sẽ cập nhật: {syncPreview.actionable}
                </Badge>
                <Badge variant="outline" className="px-2 py-1">
                  Bỏ qua: {syncPreview.skipped}
                </Badge>
              </div>

              {syncPreview.actionable === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Tất cả các dependency cùng dự án đã có Fix Version này hoặc không có mục nào cần cập nhật.
                </p>
              ) : (
                <div className="max-h-60 overflow-y-auto rounded-md border border-border/60">
                  <table className="w-full text-xs">
                    <thead className="border-b bg-muted/50 text-left text-muted-foreground sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Task</th>
                        <th className="py-2 px-3">Hành động</th>
                        <th className="py-2 px-3">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {syncPreview.items.map((item) => (
                        <tr
                          key={item.jiraKey}
                          className={item.actionable ? "bg-background" : "bg-muted/20 text-muted-foreground"}
                        >
                          <td className="py-2 px-3 font-mono font-medium">{item.jiraKey}</td>
                          <td className="py-2 px-3">
                            {item.actionable ? (
                              <Badge variant="success" className="text-[10px]">
                                Cập nhật
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                Bỏ qua
                              </Badge>
                            )}
                          </td>
                          <td className="py-2 px-3">{item.reason || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSyncOpen(false)}
              disabled={syncConfirming}
              className="cursor-pointer"
            >
              Đóng
            </Button>
            <Button
              onClick={confirmSync}
              disabled={syncLoading || syncConfirming || !syncPreview || syncPreview.actionable === 0}
              className="gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${syncConfirming ? "animate-spin" : ""}`} />
              {syncConfirming ? "Đang xử lý…" : "Xác nhận đồng bộ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
