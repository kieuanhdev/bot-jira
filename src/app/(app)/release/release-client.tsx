"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { releasesKeys, boardKeys } from "@/lib/query-keys";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  UserCheck,
  FileText,
  History,
  Copy,
  Check,
  Search,
  ExternalLink,
  ChevronRight,
  Info,
  ShieldOff,
  GitBranch,
  GitPullRequest,
  Cpu,
  Activity,
  CheckSquare,
  Sparkles,
  FolderKanban,
  Briefcase,
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
  id?: string;
  gate: string;
  state: "passed" | "failed" | "unknown" | "overridden";
  summary: string;
  blockers: GateBlocker[];
  sourceTime?: string | null;
  details?: Record<string, unknown>;
};

type ReleaseApproval = {
  id: string;
  type: "qa" | "release_manager";
  approvedById: string;
  note: string;
  approvedAt: string;
};

type ReleaseGateOverride = {
  id: string;
  gate: string;
  reason: string;
  createdById: string;
  createdAt: string;
  expiresAt?: string | null;
};

type ReleaseCheckState = {
  id?: string;
  ready: boolean;
  status: string;
  summary?: string;
  blockers: GateBlocker[];
  gates: GateResult[];
  createdAt?: string;
  tasks?: ReleaseTask[];
  dependencyGraph?: DependencyGraph;
};

type Release = {
  id: string;
  version: string;
  projectKey: string;
  jiraVersionId?: string | null;
  targetLabel: string;
  description?: string;
  status: "draft" | "checking" | "ready" | "blocked" | "unknown" | "released";
  notes: string;
  createdAt: string;
  releasedAt?: string | null;
  tasks: Task[];
  taskCount?: number;
  doneCount?: number;
  latestCheck?: ReleaseCheckState | null;
  approvals?: ReleaseApproval[];
  gateOverrides?: ReleaseGateOverride[];
};

const DONE_CATEGORIES = ["done"];

const GATE_LABELS: Record<string, string> = {
  non_empty_release: "Bản phát hành không rỗng",
  task_status: "Trạng thái công việc (Tasks)",
  critical_bugs: "Lỗi nghiêm trọng (Critical bugs)",
  sentry: "Cảnh báo lỗi Sentry",
  branches: "Trạng thái nhánh Git",
  pull_requests: "Pull Request đã merge",
  data_freshness: "Độ tươi mới dữ liệu Jira/Git",
  ci: "Tình trạng CI Build",
  manual_approval: "Phê duyệt thủ công (QA & RM)",
  ai_advisory: "Tư vấn rủi ro tự động AI",
  dependency_version_consistency: "Nhất quán Fix Version trên cây phụ thuộc",
  dependency_graph_integrity: "Toàn vẹn đồ thị dependency",
};

const GATE_CATEGORIES: Record<string, { category: string; icon: typeof CheckSquare }> = {
  non_empty_release: { category: "Task & Phạm vi", icon: CheckSquare },
  task_status: { category: "Task & Phạm vi", icon: CheckSquare },
  critical_bugs: { category: "Task & Phạm vi", icon: AlertTriangle },
  branches: { category: "Mã nguồn & CI", icon: GitBranch },
  pull_requests: { category: "Mã nguồn & CI", icon: GitPullRequest },
  ci: { category: "Mã nguồn & CI", icon: Cpu },
  sentry: { category: "Vận hành & AI", icon: Activity },
  data_freshness: { category: "Vận hành & AI", icon: RefreshCw },
  ai_advisory: { category: "Vận hành & AI", icon: Sparkles },
  dependency_version_consistency: { category: "Cấu trúc Phụ thuộc", icon: Network },
  dependency_graph_integrity: { category: "Cấu trúc Phụ thuộc", icon: Network },
  manual_approval: { category: "Ký duyệt", icon: UserCheck },
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
  unknown: "Cảnh báo",
  overridden: "Miễn trừ",
};

function gateVariant(state: GateResult["state"]): "success" | "danger" | "warning" | "secondary" {
  switch (state) {
    case "passed":
      return "success";
    case "overridden":
      return "secondary";
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
  return (
    <Badge variant={map[status] ?? "secondary"} className="gap-1 font-medium">
      {status === "ready" && <CheckCircle2 className="h-3 w-3" />}
      {status === "blocked" && <XCircle className="h-3 w-3" />}
      {status === "released" && <Rocket className="h-3 w-3" />}
      {status === "draft" && <Clock className="h-3 w-3" />}
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

function isTaskBlocked(t: ReleaseTask, blockers: GateBlocker[]): boolean {
  if (!DONE_CATEGORIES.includes(t.issue.statusCategory)) return true;
  if (t.hasReleaseVersion === false) return true;
  if (blockers.some((b) => b.jiraKey === t.jiraKey)) return true;
  return false;
}

export function ReleaseClient() {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Project context from URL
  const initialProject = searchParams?.get("project") ?? "all";
  const [selectedProject, setSelectedProject] = useState(initialProject);

  useEffect(() => {
    const p = searchParams?.get("project") ?? "all";
    setSelectedProject(p);
  }, [searchParams]);

  // Create Release Dialog
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [linkVersionId, setLinkVersionId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [versions, setVersions] = useState<JiraVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Per-release runtime check state
  const [runtimeCheck, setRuntimeCheck] = useState<Record<string, ReleaseCheckState>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  // Active tab per release
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});

  // View state per release
  const [viewModes, setViewModes] = useState<Record<string, "tree" | "flat">>({});
  const [filterBlockersOnly, setFilterBlockersOnly] = useState<Record<string, boolean>>({});
  const [taskSearchQuery, setTaskSearchQuery] = useState<Record<string, string>>({});

  // Release notes editing per release
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({});
  const [copiedChangelog, setCopiedChangelog] = useState<string | null>(null);

  // Sign-off Approval Dialog
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalTargetRelease, setApprovalTargetRelease] = useState<Release | null>(null);
  const [approvalType, setApprovalType] = useState<"qa" | "release_manager">("qa");
  const [approvalNote, setApprovalNote] = useState("");
  const [submittingApproval, setSubmittingApproval] = useState(false);

  // Gate Override Dialog
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideTargetRelease, setOverrideTargetRelease] = useState<Release | null>(null);
  const [overrideGate, setOverrideGate] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [submittingOverride, setSubmittingOverride] = useState(false);

  // Check History Dialog
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyTargetRelease, setHistoryTargetRelease] = useState<Release | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyList, setHistoryList] = useState<Array<{
    id: string;
    triggeredBy?: string | null;
    status: string;
    summary: string;
    createdAt: string;
    gates: Array<{ id: string; gate: string; state: string; summary: string }>;
  }>>([]);

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

  // Load Releases
  const { data, isLoading } = useQuery<{ items: Release[] }>({
    queryKey: releasesKeys.all,
    queryFn: () => api<{ items: Release[] }>("/api/releases"),
  });

  // Load Projects from Jira read model
  const { data: projectsData } = useQuery<{ items: Array<{ key: string; openCount: number }> }>({
    queryKey: boardKeys.projects,
    queryFn: () => api<{ items: Array<{ key: string; openCount: number }> }>("/api/projects"),
  });

  const releases = useMemo(() => data?.items ?? [], [data]);

  // Combined Distinct projects list with release counts
  const projectList = useMemo(() => {
    const map = new Map<string, { key: string; releaseCount: number }>();

    // Seed from /api/projects
    (projectsData?.items ?? []).forEach((p) => {
      map.set(p.key, { key: p.key, releaseCount: 0 });
    });

    // Count releases per project
    releases.forEach((r) => {
      if (r.projectKey) {
        const existing = map.get(r.projectKey);
        if (existing) {
          existing.releaseCount++;
        } else {
          map.set(r.projectKey, { key: r.projectKey, releaseCount: 1 });
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [projectsData?.items, releases]);

  // Handle Project Selection & URL sync
  const handleSelectProject = (projKey: string) => {
    setSelectedProject(projKey);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (projKey === "all") {
      params.delete("project");
    } else {
      params.set("project", projKey);
    }
    const qs = params.toString();
    router.replace(pathname + (qs ? `?${qs}` : ""), { scroll: false });
  };

  // Open Create Dialog with pre-selected Project context
  const handleOpenCreateDialog = (targetProj?: string) => {
    const projToUse = targetProj ?? (selectedProject !== "all" ? selectedProject : projectList[0]?.key ?? "");
    setProjectKey(projToUse);
    setVersion("");
    setLinkVersionId("");
    setDescription("");
    if (projToUse) {
      loadVersions(projToUse);
    } else {
      setVersions([]);
    }
    setOpen(true);
  };

  // KPI Metrics Calculation strictly for current project scope
  const kpis = useMemo(() => {
    const inScope = releases.filter((r) => {
      if (selectedProject !== "all" && r.projectKey !== selectedProject) return false;
      return true;
    });

    const total = inScope.length;
    let ready = 0;
    let blocked = 0;
    let released = 0;
    let draft = 0;

    inScope.forEach((r) => {
      const activeCheck = runtimeCheck[r.id] ?? r.latestCheck;
      const status = r.status === "released" ? "released" : activeCheck?.status ?? r.status;
      if (status === "released") released++;
      else if (status === "ready") ready++;
      else if (status === "blocked") blocked++;
      else draft++;
    });

    return { total, ready, blocked, released, draft };
  }, [releases, runtimeCheck, selectedProject]);

  // Filtered releases based on project scope, status filter and search query
  const filteredReleases = useMemo(() => {
    return releases.filter((r) => {
      if (selectedProject !== "all" && r.projectKey !== selectedProject) return false;

      const activeCheck = runtimeCheck[r.id] ?? r.latestCheck;
      const effectiveStatus = r.status === "released" ? "released" : activeCheck?.status ?? r.status;

      if (selectedStatus !== "all") {
        if (selectedStatus === "ready" && effectiveStatus !== "ready") return false;
        if (selectedStatus === "blocked" && effectiveStatus !== "blocked") return false;
        if (selectedStatus === "released" && effectiveStatus !== "released") return false;
        if (selectedStatus === "draft" && !["draft", "checking", "unknown"].includes(effectiveStatus)) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchVersion = r.version.toLowerCase().includes(q);
        const matchProject = r.projectKey?.toLowerCase().includes(q);
        const matchDesc = r.description?.toLowerCase().includes(q);
        if (!matchVersion && !matchProject && !matchDesc) return false;
      }
      return true;
    });
  }, [releases, runtimeCheck, selectedProject, selectedStatus, searchQuery]);

  async function loadVersions(pk: string) {
    if (!pk) {
      setVersions([]);
      return;
    }
    setVersionsLoading(true);
    try {
      const res = await api<{ items: JiraVersion[] }>(
        `/api/releases/tmp/versions?projectKey=${encodeURIComponent(pk)}`
      ).catch(async () => {
        return api<{ items: JiraVersion[] }>(`/api/issues/filters/projects`).then(() => ({
          items: [],
        }));
      });
      setVersions(res?.items ?? []);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function createRelease() {
    if (!version.trim()) return;
    try {
      await api("/api/releases", {
        method: "POST",
        body: {
          version: version.trim(),
          projectKey: projectKey.trim() || undefined,
          jiraVersionId: linkVersionId || undefined,
          description: description.trim() || undefined,
          targetLabel: projectKey.trim() ? undefined : `release-${version.trim()}`,
        },
      });
      setOpen(false);
      setVersion("");
      setDescription("");
      qc.invalidateQueries({ queryKey: releasesKeys.all });
    } catch (e) {
      alert((e as Error).message || "Không thể tạo bản phát hành.");
    }
  }

  async function checkReady(id: string) {
    setCheckingId(id);
    setReleaseError(null);
    try {
      const r = await api<{
        ready: boolean;
        status: string;
        blockers: GateBlocker[];
        gates: GateResult[];
        tasks?: ReleaseTask[];
        dependencyGraph?: DependencyGraph;
      }>(`/api/releases/${id}/ready`, { method: "POST", body: {} });

      setRuntimeCheck((prev) => ({
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
    } catch (e) {
      setReleaseError((e as Error).message || "Kiểm tra sẵn sàng thất bại.");
    } finally {
      setCheckingId(null);
      qc.invalidateQueries({ queryKey: releasesKeys.all });
    }
  }

  async function publishRelease(rel: Release) {
    if (!confirm(`Bạn có chắc chắn muốn xuất bản phiên bản v${rel.version} (${rel.projectKey}) lên Jira không?`)) {
      return;
    }
    setReleasingId(rel.id);
    setReleaseError(null);
    try {
      await api(`/api/releases/${rel.id}/release`, { method: "POST", body: {} });
      qc.invalidateQueries({ queryKey: releasesKeys.all });
    } catch (e) {
      setReleaseError((e as Error).message || "Xuất bản phiên bản thất bại.");
    } finally {
      setReleasingId(null);
    }
  }

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
      qc.invalidateQueries({ queryKey: releasesKeys.all });
      checkReady(syncRel.id);
    } catch (e) {
      setSyncError((e as Error).message || "Đồng bộ thất bại.");
    } finally {
      setSyncConfirming(false);
    }
  }

  async function handleAddApproval() {
    if (!approvalTargetRelease) return;
    setSubmittingApproval(true);
    try {
      await api(`/api/releases/${approvalTargetRelease.id}/approvals`, {
        method: "POST",
        body: {
          type: approvalType,
          note: approvalNote.trim() || undefined,
        },
      });
      setApprovalDialogOpen(false);
      setApprovalNote("");
      qc.invalidateQueries({ queryKey: releasesKeys.all });
      checkReady(approvalTargetRelease.id);
    } catch (e) {
      alert((e as Error).message || "Không thể ký duyệt.");
    } finally {
      setSubmittingApproval(false);
    }
  }

  async function handleRevokeApproval(relId: string, approvalId: string) {
    if (!confirm("Bạn có chắc chắn muốn thu hồi phê duyệt này không?")) return;
    try {
      await api(`/api/releases/${relId}/approvals?approvalId=${approvalId}`, {
        method: "DELETE",
      });
      qc.invalidateQueries({ queryKey: releasesKeys.all });
      checkReady(relId);
    } catch (e) {
      alert((e as Error).message || "Không thể thu hồi phê duyệt.");
    }
  }

  async function handleAddOverride() {
    if (!overrideTargetRelease || !overrideGate.trim() || !overrideReason.trim()) return;
    setSubmittingOverride(true);
    try {
      await api(`/api/releases/${overrideTargetRelease.id}/overrides`, {
        method: "POST",
        body: {
          gate: overrideGate.trim(),
          reason: overrideReason.trim(),
        },
      });
      setOverrideDialogOpen(false);
      setOverrideGate("");
      setOverrideReason("");
      qc.invalidateQueries({ queryKey: releasesKeys.all });
      checkReady(overrideTargetRelease.id);
    } catch (e) {
      alert((e as Error).message || "Không thể ghi đè cổng.");
    } finally {
      setSubmittingOverride(false);
    }
  }

  async function handleRevokeOverride(relId: string, overrideId: string) {
    if (!confirm("Bạn có chắc muốn huỷ bỏ miễn trừ cổng này?")) return;
    try {
      await api(`/api/releases/${relId}/overrides?overrideId=${overrideId}`, {
        method: "DELETE",
      });
      qc.invalidateQueries({ queryKey: releasesKeys.all });
      checkReady(relId);
    } catch (e) {
      alert((e as Error).message || "Không thể huỷ bỏ miễn trừ.");
    }
  }

  async function openHistory(rel: Release) {
    setHistoryTargetRelease(rel);
    setHistoryDialogOpen(true);
    setHistoryLoading(true);
    try {
      const res = await api<{ checks: any[] }>(`/api/releases/${rel.id}/checks?limit=15`);
      setHistoryList(res.checks || []);
    } catch {
      setHistoryList([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function saveNotes(relId: string) {
    const text = editingNotes[relId] ?? "";
    setSavingNotes((prev) => ({ ...prev, [relId]: true }));
    try {
      await api(`/api/releases/${relId}`, {
        method: "PATCH",
        body: { notes: text },
      });
      qc.invalidateQueries({ queryKey: releasesKeys.all });
    } catch (e) {
      alert((e as Error).message || "Không thể lưu ghi chú.");
    } finally {
      setSavingNotes((prev) => ({ ...prev, [relId]: false }));
    }
  }

  function copyChangelog(rel: Release, tasks: ReleaseTask[]) {
    const doneTasks = tasks.filter((t) => DONE_CATEGORIES.includes(t.issue.statusCategory));
    const lines = [
      `# Release Notes: v${rel.version}`,
      rel.projectKey ? `**Dự án:** ${rel.projectKey}` : "",
      rel.description ? `*${rel.description}*` : "",
      "",
      `### 🚀 Danh sách thay đổi (${doneTasks.length} tasks)`,
      ...doneTasks.map((t) => `- [${t.jiraKey}] ${t.issue.summary} (${t.issue.points ?? 0} pts)`),
      "",
      `*Xuất bản tự động lúc ${new Date().toLocaleString("vi-VN")}*`,
    ].filter(Boolean);

    const content = lines.join("\n");
    navigator.clipboard.writeText(content);
    setCopiedChangelog(rel.id);
    setTimeout(() => setCopiedChangelog(null), 2500);
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner / Hero Header */}
      <div className="flex flex-col gap-4 border-b border-border/40 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Quản lý Phát hành
                {selectedProject !== "all" && (
                  <span className="text-teal-600 dark:text-teal-400 font-mono">
                    · {selectedProject}
                  </span>
                )}
              </h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                {selectedProject === "all"
                  ? "Điều hành phiên bản phát hành trên tất cả dự án, kiểm tra 10 cổng chất lượng và xuất bản lên Jira."
                  : `Đang quản lý phạm vi phát hành và Fix Version riêng cho dự án ${selectedProject}.`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: releasesKeys.all })}
            className="gap-1.5 cursor-pointer text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Làm mới
          </Button>

          <Button
            onClick={() => handleOpenCreateDialog()}
            className="gap-1.5 cursor-pointer bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs sm:text-sm"
          >
            <Plus className="h-4 w-4" />
            {selectedProject !== "all" ? `Tạo bản phát hành ${selectedProject}` : "Tạo bản phát hành"}
          </Button>
        </div>
      </div>

      {/* PROJECT-CENTRIC SWITCHER BAR */}
      <div className="flex flex-col gap-2 rounded-2xl bg-card border border-border/60 p-3 shadow-xs">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Briefcase className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Phân loại theo Dự án Jira (Project Scope)
            </span>
          </div>
          {selectedProject !== "all" ? (
            <Badge variant="outline" className="text-[10px] font-mono border-teal-500/30 text-teal-600 dark:text-teal-400">
              Đang xem riêng: {selectedProject}
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground">Hiển thị tổng thể tất cả dự án</span>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => handleSelectProject("all")}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer shrink-0 ${
              selectedProject === "all"
                ? "bg-teal-600 text-white shadow-sm ring-2 ring-teal-500/20"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40"
            }`}
          >
            <FolderKanban className="h-3.5 w-3.5" />
            <span>Tất cả dự án</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                selectedProject === "all" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              {releases.length}
            </span>
          </button>

          {projectList.map((p) => {
            const isSelected = selectedProject === p.key;
            return (
              <button
                key={p.key}
                onClick={() => handleSelectProject(p.key)}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                  isSelected
                    ? "bg-teal-600 text-white shadow-sm ring-2 ring-teal-500/20"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40"
                }`}
              >
                <Tag className="h-3.5 w-3.5" />
                <span className="font-mono">{p.key}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    isSelected ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {p.releaseCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Summary Cards (Scoped to selectedProject) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Card className="border-border/60 bg-card/60 shadow-xs transition-all hover:border-teal-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground truncate">
                Tổng phiên bản {selectedProject !== "all" ? `(${selectedProject})` : ""}
              </span>
              <Rocket className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{kpis.total}</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 shadow-xs transition-all hover:border-emerald-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Sẵn sàng phát hành</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{kpis.ready}</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 shadow-xs transition-all hover:border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Bị chặn / Lỗi gate</span>
              <XCircle className="h-4 w-4 text-red-500" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-red-600 dark:text-red-400">{kpis.blocked}</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 shadow-xs transition-all hover:border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Đang chuẩn bị</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">{kpis.draft}</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 shadow-xs transition-all hover:border-sky-500/30 col-span-2 sm:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Đã ra mắt Jira</span>
              <Send className="h-4 w-4 text-sky-500" />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-sky-600 dark:text-sky-400">{kpis.released}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 p-2.5 rounded-xl border border-border/50">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Tìm phiên bản ${selectedProject !== "all" ? `trong ${selectedProject}` : "hoặc dự án"}…`}
              className="pl-8 text-xs bg-background h-9"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "all", label: "Tất cả trạng thái" },
            { id: "ready", label: "Sẵn sàng" },
            { id: "blocked", label: "Bị chặn" },
            { id: "draft", label: "Đang chuẩn bị" },
            { id: "released", label: "Đã phát hành" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                selectedStatus === tab.id
                  ? "bg-teal-600 text-white shadow-xs"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      )}

      {/* Empty State for Project or Workspace */}
      {!isLoading && releases.length === 0 && (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <PackageOpen className="h-7 w-7" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">Chưa có bản phát hành nào</p>
              <p className="max-w-md text-xs text-muted-foreground mt-1">
                Tạo bản phát hành mới gắn với Jira Fix Version để tự động kiểm tra chất lượng trước khi ra mắt production.
              </p>
            </div>
            <Button
              onClick={() => handleOpenCreateDialog()}
              className="mt-2 gap-1.5 bg-teal-600 hover:bg-teal-700 text-white cursor-pointer text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Tạo bản phát hành đầu tiên
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty State when Project has 0 releases */}
      {!isLoading && releases.length > 0 && selectedProject !== "all" && filteredReleases.length === 0 && !searchQuery.trim() && selectedStatus === "all" && (
        <Card className="border-dashed border-2 border-border/80">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Tag className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">
                Dự án <span className="font-mono text-teal-600 dark:text-teal-400">{selectedProject}</span> chưa có bản phát hành nào
              </p>
              <p className="max-w-md text-xs text-muted-foreground mt-1">
                Bạn có thể tạo bản phát hành đầu tiên cho dự án {selectedProject}. Hệ thống sẽ liên kết với Jira Fix Version tương ứng.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSelectProject("all")}
                className="text-xs cursor-pointer"
              >
                Xem tất cả dự án
              </Button>
              <Button
                onClick={() => handleOpenCreateDialog(selectedProject)}
                className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white cursor-pointer text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Tạo bản phát hành cho {selectedProject}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Search Results */}
      {!isLoading && releases.length > 0 && filteredReleases.length === 0 && (searchQuery.trim() || selectedStatus !== "all") && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Filter className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">Không tìm thấy bản phát hành phù hợp bộ lọc</p>
            <p className="text-xs text-muted-foreground">Thử đổi từ khoá tìm kiếm hoặc chọn lọc trạng thái khác.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSelectedStatus("all");
              }}
              className="mt-2 text-xs cursor-pointer"
            >
              Xoá bộ lọc tìm kiếm
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Release List */}
      {filteredReleases.map((rel) => {
        const check = runtimeCheck[rel.id] ?? rel.latestCheck;

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

        const totalTasksCount = allTasks.length;
        const doneCount = allTasks.filter((t) => DONE_CATEGORIES.includes(t.issue.statusCategory)).length;
        const directTasks = allTasks.filter((t) => t.inclusion !== "dependency");
        const dependencyTasks = allTasks.filter((t) => t.inclusion === "dependency");

        const totalPoints = allTasks.reduce((acc, t) => acc + (t.issue.points ?? 0), 0);
        const donePoints = allTasks
          .filter((t) => DONE_CATEGORIES.includes(t.issue.statusCategory))
          .reduce((acc, t) => acc + (t.issue.points ?? 0), 0);

        const completionPct = totalTasksCount > 0 ? Math.round((doneCount / totalTasksCount) * 100) : 0;

        const passedGatesCount = check?.gates.filter((g) => g.state === "passed" || g.state === "overridden").length ?? 0;
        const totalGatesCount = check?.gates.length ?? 10;

        const approvals = rel.approvals ?? [];
        const qaApproval = approvals.find((a) => a.type === "qa");
        const rmApproval = approvals.find((a) => a.type === "release_manager");

        const hasMissingDependencyVersions = Boolean(
          dependencyTasks.some((t) => t.sameProject !== false && t.hasReleaseVersion === false) ||
            check?.gates.some(
              (g) => g.gate === "dependency_version_consistency" && (g.state === "failed" || g.state === "unknown")
            )
        );

        const currentView = viewModes[rel.id] ?? "tree";
        const currentFilterBlockers = filterBlockersOnly[rel.id] ?? false;
        const currentTaskSearch = taskSearchQuery[rel.id] ?? "";
        const blockersList = check?.blockers ?? [];

        const activeTab = activeTabs[rel.id] ?? "gates";

        const filterFn = (t: ReleaseTask) => {
          if (currentFilterBlockers && !isTaskBlocked(t, blockersList)) return false;
          if (currentTaskSearch.trim()) {
            const q = currentTaskSearch.toLowerCase();
            return t.jiraKey.toLowerCase().includes(q) || t.issue.summary.toLowerCase().includes(q);
          }
          return true;
        };

        const isReady = check?.ready ?? (rel.status === "ready");

        return (
          <Card
            key={rel.id}
            className={`overflow-hidden border transition-all ${
              rel.status === "released"
                ? "border-sky-500/40 shadow-xs"
                : isReady
                ? "border-emerald-500/50 shadow-sm"
                : "border-border/70"
            }`}
          >
            {/* Release Card Header */}
            <CardHeader className="bg-muted/15 border-b border-border/40 pb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                      <Rocket className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-xl font-bold tracking-tight">
                      v{rel.version}
                    </CardTitle>
                    <StatusBadge status={rel.status === "released" ? "released" : (check?.status as any) ?? rel.status} />

                    {rel.projectKey ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-mono font-medium text-foreground">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        {rel.projectKey}
                        {rel.jiraVersionId ? (
                          <span className="text-[10px] text-muted-foreground ml-1">(Jira Fix Version)</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                        <Tag className="h-3 w-3" />
                        {rel.targetLabel}
                      </span>
                    )}
                  </div>

                  <CardDescription className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                    {rel.description && <span className="text-foreground/80 font-medium">{rel.description} ·</span>}
                    <span>Tạo {timeAgo(rel.createdAt)}</span>
                    {rel.releasedAt && (
                      <span className="text-sky-600 dark:text-sky-400 font-medium">
                        · Đã phát hành lên Jira {timeAgo(rel.releasedAt)}
                      </span>
                    )}
                  </CardDescription>
                </div>

                {/* Main Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openHistory(rel)}
                    className="gap-1.5 cursor-pointer text-xs h-8"
                    title="Xem lịch sử kiểm tra"
                  >
                    <History className="h-3.5 w-3.5" />
                    Lịch sử check
                  </Button>

                  <Button
                    variant={isReady ? "outline" : "default"}
                    size="sm"
                    disabled={checkingId === rel.id}
                    onClick={() => checkReady(rel.id)}
                    className={`gap-1.5 cursor-pointer text-xs h-8 ${
                      !isReady ? "bg-teal-600 hover:bg-teal-700 text-white" : ""
                    }`}
                  >
                    {checkingId === rel.id ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : isReady ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5" />
                    )}
                    {checkingId === rel.id ? "Đang quét cổng…" : "Kiểm tra sẵn sàng"}
                  </Button>

                  {rel.status !== "released" && isReady && (
                    <Button
                      size="sm"
                      disabled={releasingId === rel.id}
                      onClick={() => publishRelease(rel)}
                      className="gap-1.5 cursor-pointer text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {releasingId === rel.id ? "Đang xuất bản…" : "Xuất bản lên Jira"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Release Pipeline Stepper Ribbon */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-xl bg-background/80 p-2.5 border border-border/50 text-xs">
                {/* Step 1: Scope */}
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                      totalTasksCount > 0 ? "bg-teal-500/20 text-teal-600 dark:text-teal-400" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    1
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">Phạm vi công việc</p>
                    <p className="text-[11px] text-muted-foreground">
                      {doneCount}/{totalTasksCount} tasks ({completionPct}%)
                    </p>
                  </div>
                </div>

                {/* Step 2: Quality Gates */}
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                      check?.ready
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : check?.status === "blocked"
                        ? "bg-red-500/20 text-red-600 dark:text-red-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    2
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">10 Quality Gates</p>
                    <p className="text-[11px] text-muted-foreground">
                      {check ? `${passedGatesCount}/${totalGatesCount} cổng đạt` : "Chưa kiểm tra"}
                    </p>
                  </div>
                </div>

                {/* Step 3: Sign-offs */}
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                      qaApproval && rmApproval
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : qaApproval || rmApproval
                        ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    3
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">Ký duyệt Sign-off</p>
                    <p className="text-[11px] text-muted-foreground">
                      QA: {qaApproval ? "✓" : "Chờ"} · RM: {rmApproval ? "✓" : "Chờ"}
                    </p>
                  </div>
                </div>

                {/* Step 4: Publish */}
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                      rel.status === "released"
                        ? "bg-sky-500/20 text-sky-600 dark:text-sky-400"
                        : isReady
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    4
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">Xuất bản Jira</p>
                    <p className="text-[11px] text-muted-foreground">
                      {rel.status === "released" ? "Đã ra mắt" : isReady ? "Sẵn sàng bấm" : "Chưa đủ điều kiện"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3 flex flex-col gap-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>
                    Tiến độ hoàn thành: {doneCount}/{totalTasksCount} task ({donePoints}/{totalPoints} story points)
                  </span>
                  <span className="font-medium text-foreground">{completionPct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      completionPct === 100 ? "bg-emerald-500" : "bg-teal-600"
                    }`}
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
              </div>
            </CardHeader>

            {/* Error banner if any */}
            {releaseError && (
              <div className="mx-6 mt-4 rounded-md border border-red-300/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400 flex items-center justify-between">
                <span>{releaseError}</span>
                <Button size="sm" variant="ghost" onClick={() => setReleaseError(null)} className="h-6 text-xs">
                  Đóng
                </Button>
              </div>
            )}

            {/* Release Card Body / Tabs */}
            <CardContent className="p-4 sm:p-6">
              <Tabs
                value={activeTab}
                onValueChange={(val) => setActiveTabs((prev) => ({ ...prev, [rel.id]: val }))}
                className="w-full"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                  <TabsList className="bg-muted/50 p-0.5">
                    <TabsTrigger value="gates" className="text-xs gap-1.5 cursor-pointer">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Cổng chất lượng ({check?.gates?.length ?? 10})
                    </TabsTrigger>
                    <TabsTrigger value="approvals" className="text-xs gap-1.5 cursor-pointer">
                      <UserCheck className="h-3.5 w-3.5" />
                      Ký duyệt ({approvals.length}/2)
                    </TabsTrigger>
                    <TabsTrigger value="tasks" className="text-xs gap-1.5 cursor-pointer">
                      <CheckSquare className="h-3.5 w-3.5" />
                      Danh sách Task ({allTasks.length})
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="text-xs gap-1.5 cursor-pointer">
                      <FileText className="h-3.5 w-3.5" />
                      Changelog & Ghi chú
                    </TabsTrigger>
                  </TabsList>

                  {/* Contextual actions on right of tabs */}
                  {activeTab === "gates" && hasMissingDependencyVersions && (
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

                  {activeTab === "approvals" && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setApprovalTargetRelease(rel);
                        setApprovalDialogOpen(true);
                      }}
                      className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs h-7 cursor-pointer"
                    >
                      <UserCheck className="h-3 w-3" />
                      Thêm chữ ký phê duyệt
                    </Button>
                  )}
                </div>

                {/* TAB 1: QUALITY GATES & BLOCKERS */}
                <TabsContent value="gates" className="mt-4 flex flex-col gap-4">
                  {/* Status Banner */}
                  {check ? (
                    <div
                      className={`rounded-xl border p-4 text-xs ${
                        check.ready
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                          : "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {check.ready ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
                          )}
                          <div>
                            <p className="font-bold text-sm">
                              {check.ready
                                ? "Bản phát hành SẴN SÀNG"
                                : `Chưa sẵn sàng phát hành (${
                                    STATUS_LABELS[check.status as Release["status"]] ?? check.status
                                  })`}
                            </p>
                            <p className="text-[11px] opacity-90">
                              {check.ready
                                ? "Tất cả các cổng kiểm tra bắt buộc đã vượt qua hoặc được miễn trừ hợp lệ."
                                : `Phát hiện ${check.blockers.length} điểm nghẽn (blockers) cần xử lý trước khi ra mắt.`}
                            </p>
                          </div>
                        </div>

                        {check.createdAt && (
                          <span className="text-[10px] opacity-75 shrink-0">
                            Kiểm tra gần nhất: {timeAgo(check.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                      <ShieldAlert className="h-8 w-8 text-muted-foreground/60" />
                      <p className="font-medium text-foreground">Chưa có kết quả kiểm tra cho phiên bản này</p>
                      <p className="max-w-md">
                        Bấm &ldquo;Kiểm tra sẵn sàng&rdquo; để chạy quét 10 cổng chất lượng tự động (Task, Git, CI, Sentry, Dependency).
                      </p>
                      <Button
                        size="sm"
                        onClick={() => checkReady(rel.id)}
                        disabled={checkingId === rel.id}
                        className="mt-1 bg-teal-600 hover:bg-teal-700 text-white text-xs cursor-pointer"
                      >
                        Chạy kiểm tra ngay
                      </Button>
                    </div>
                  )}

                  {/* 10 Quality Gates Grid */}
                  {check && check.gates.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {check.gates.map((g, idx) => {
                        const meta = GATE_CATEGORIES[g.gate] ?? { category: "Khác", icon: CheckSquare };
                        const Icon = meta.icon;
                        const isOverridable = !["non_empty_release", "ci"].includes(g.gate);
                        const isOverridden = g.state === "overridden";

                        return (
                          <div
                            key={`${g.gate}-${idx}`}
                            className={`flex flex-col justify-between rounded-xl border p-3.5 transition-colors ${
                              g.state === "failed"
                                ? "border-red-500/30 bg-red-500/5"
                                : g.state === "unknown"
                                ? "border-amber-500/30 bg-amber-500/5"
                                : isOverridden
                                ? "border-purple-500/30 bg-purple-500/5"
                                : "border-border/60 bg-card"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0">
                                  <Icon className="h-3.5 w-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-foreground truncate">{gateLabel(g.gate)}</p>
                                  <span className="text-[10px] text-muted-foreground font-mono">{meta.category}</span>
                                </div>
                              </div>

                              <Badge variant={gateVariant(g.state)} className="shrink-0 text-[10px] font-semibold">
                                {GATE_STATE_LABELS[g.state] ?? g.state}
                              </Badge>
                            </div>

                            <p className="mt-2 text-xs text-muted-foreground" title={g.summary}>
                              {g.summary}
                            </p>

                            {/* Blockers list inside gate */}
                            {g.blockers.length > 0 && (
                              <div className="mt-2.5 rounded-md bg-background/80 border border-border/40 p-2 text-xs">
                                <p className="font-semibold text-[11px] text-red-600 dark:text-red-400 mb-1">
                                  Điểm nghẽn ({g.blockers.length}):
                                </p>
                                <ul className="space-y-1">
                                  {g.blockers.map((b, bIdx) => (
                                    <li key={bIdx} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                      <span className="text-red-500 font-bold shrink-0">•</span>
                                      <div className="min-w-0 flex-1">
                                        {b.jiraKey ? (
                                          <Link
                                            href={`/issue/${b.jiraKey}`}
                                            className="font-mono font-semibold text-primary hover:underline mr-1"
                                          >
                                            {b.jiraKey}:
                                          </Link>
                                        ) : null}
                                        <span>{b.reason}</span>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Action footer for gate */}
                            <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-2 text-[11px]">
                              {g.sourceTime ? (
                                <span className="text-muted-foreground/70">
                                  Cập nhật: {timeAgo(g.sourceTime)}
                                </span>
                              ) : (
                                <span />
                              )}

                              {g.state === "failed" && isOverridable && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setOverrideTargetRelease(rel);
                                    setOverrideGate(g.gate);
                                    setOverrideDialogOpen(true);
                                  }}
                                  className="h-6 px-2 text-[10px] text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                                >
                                  <ShieldOff className="h-3 w-3 mr-1" />
                                  Miễn trừ cổng này
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Overrides Table if any */}
                  {rel.gateOverrides && rel.gateOverrides.length > 0 && (
                    <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3.5 text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-purple-700 dark:text-purple-300 mb-2">
                        <ShieldOff className="h-4 w-4" />
                        Danh sách Cổng đang được miễn trừ ({rel.gateOverrides.length})
                      </div>
                      <div className="divide-y divide-border/40">
                        {rel.gateOverrides.map((ov) => (
                          <div key={ov.id} className="py-2 flex items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold text-foreground">{gateLabel(ov.gate)}</span>:{" "}
                              <span className="text-muted-foreground">{ov.reason}</span>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                Tạo lúc {timeAgo(ov.createdAt)}
                                {ov.expiresAt ? ` · Hết hạn: ${timeAgo(ov.expiresAt)}` : ""}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevokeOverride(rel.id, ov.id)}
                              className="h-6 px-2 text-[11px] text-red-600 hover:bg-red-500/10 cursor-pointer"
                            >
                              Huỷ miễn trừ
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* TAB 2: SIGN-OFF APPROVALS */}
                <TabsContent value="approvals" className="mt-4 flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* QA Sign-off Card */}
                    <div
                      className={`rounded-xl border p-4 text-xs transition-colors ${
                        qaApproval ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/60 bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                              qaApproval
                                ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <UserCheck className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-foreground">Phê duyệt QA (QA Sign-off)</p>
                            <p className="text-[11px] text-muted-foreground">Xác nhận chất lượng kiểm thử & testcase</p>
                          </div>
                        </div>
                        <Badge variant={qaApproval ? "success" : "secondary"}>
                          {qaApproval ? "ĐÃ KÝ DUYỆT" : "CHỜ DUYỆT"}
                        </Badge>
                      </div>

                      {qaApproval ? (
                        <div className="mt-3 rounded-lg bg-background/80 p-3 border border-border/40">
                          <p className="font-medium text-foreground">
                            {qaApproval.note ? `“${qaApproval.note}”` : "Đã xác nhận đạt tiêu chuẩn QA."}
                          </p>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/40 pt-2">
                            <span>Ký duyệt lúc {timeAgo(qaApproval.approvedAt)}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevokeApproval(rel.id, qaApproval.id)}
                              className="h-6 px-1.5 text-red-600 hover:bg-red-500/10 text-[10px] cursor-pointer"
                            >
                              Thu hồi
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 flex items-center justify-between pt-2">
                          <span className="text-[11px] text-muted-foreground">Chưa có chữ ký từ đội ngũ QA</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setApprovalTargetRelease(rel);
                              setApprovalType("qa");
                              setApprovalDialogOpen(true);
                            }}
                            className="h-7 text-xs cursor-pointer border-teal-500/40 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10"
                          >
                            Ký duyệt QA
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Release Manager Sign-off Card */}
                    <div
                      className={`rounded-xl border p-4 text-xs transition-colors ${
                        rmApproval ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/60 bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                              rmApproval
                                ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <Rocket className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-foreground">Phê duyệt Quản lý (Release Manager)</p>
                            <p className="text-[11px] text-muted-foreground">Chấp thuận phạm vi và xuất bản lên production</p>
                          </div>
                        </div>
                        <Badge variant={rmApproval ? "success" : "secondary"}>
                          {rmApproval ? "ĐÃ KÝ DUYỆT" : "CHỜ DUYỆT"}
                        </Badge>
                      </div>

                      {rmApproval ? (
                        <div className="mt-3 rounded-lg bg-background/80 p-3 border border-border/40">
                          <p className="font-medium text-foreground">
                            {rmApproval.note ? `“${rmApproval.note}”` : "Chấp thuận triển khai phiên bản."}
                          </p>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/40 pt-2">
                            <span>Ký duyệt lúc {timeAgo(rmApproval.approvedAt)}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevokeApproval(rel.id, rmApproval.id)}
                              className="h-6 px-1.5 text-red-600 hover:bg-red-500/10 text-[10px] cursor-pointer"
                            >
                              Thu hồi
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 flex items-center justify-between pt-2">
                          <span className="text-[11px] text-muted-foreground">Chưa có chữ ký từ Release Manager</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setApprovalTargetRelease(rel);
                              setApprovalType("release_manager");
                              setApprovalDialogOpen(true);
                            }}
                            className="h-7 text-xs cursor-pointer border-teal-500/40 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10"
                          >
                            Ký duyệt RM
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground flex items-center gap-2">
                    <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>
                      Chính sách an toàn: Để xuất bản phiên bản lên Jira, khuyến nghị cần có cả 2 chữ ký từ QA và Release Manager nhằm đảm bảo chất lượng.
                    </span>
                  </div>
                </TabsContent>

                {/* TAB 3: TASKS & DEPENDENCY GRAPH */}
                <TabsContent value="tasks" className="mt-4 flex flex-col gap-3">
                  {/* Task Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/20 p-2 rounded-lg border border-border/40">
                    <div className="flex items-center gap-2 flex-1 max-w-xs">
                      <Search className="h-3.5 w-3.5 text-muted-foreground ml-1" />
                      <Input
                        value={currentTaskSearch}
                        onChange={(e) =>
                          setTaskSearchQuery((prev) => ({ ...prev, [rel.id]: e.target.value }))
                        }
                        placeholder="Tìm task trong release…"
                        className="h-7 text-xs bg-background"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={currentFilterBlockers ? "secondary" : "ghost"}
                        onClick={() =>
                          setFilterBlockersOnly((prev) => ({ ...prev, [rel.id]: !prev[rel.id] }))
                        }
                        className="h-7 gap-1 px-2 text-xs cursor-pointer"
                      >
                        <Filter className="h-3 w-3" />
                        Chỉ task lỗi / chặn
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
                          >
                            <Network className="h-3 w-3" />
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
                          >
                            <Layers className="h-3 w-3" />
                            Phẳng
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tree View Mode */}
                  {currentView === "tree" && (
                    <div className="flex flex-col gap-2.5">
                      {directTasks.filter(filterFn).length === 0 && (
                        <p className="py-6 text-center text-xs text-muted-foreground">
                          Không có task nào khớp với bộ lọc.
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
                            className={`rounded-xl border p-3 transition-colors ${
                              rootIsBlocked
                                ? "border-amber-500/40 bg-amber-500/5"
                                : "border-border/60 bg-card hover:border-border"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  href={`/issue/${root.jiraKey}`}
                                  className="font-mono text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
                                >
                                  {root.jiraKey}
                                  <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                                </Link>
                                <Badge variant="secondary" className="text-[10px]">
                                  Task trực tiếp
                                </Badge>
                                <span className="text-sm font-medium text-foreground line-clamp-1">
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
                                  className="text-[11px]"
                                >
                                  {root.issue.status}
                                </Badge>
                                <span className="font-mono text-xs text-muted-foreground">
                                  {root.issue.points ?? "—"} pts
                                </span>
                              </div>
                            </div>

                            {/* Dependencies subtree */}
                            {deps.length > 0 && (
                              <div className="mt-2.5 flex flex-col gap-1.5 border-l-2 border-border/60 pl-3">
                                {deps.map((dep) => {
                                  const depBlocked = isTaskBlocked(dep, blockersList);
                                  return (
                                    <div
                                      key={dep.jiraKey}
                                      className={`flex items-start justify-between gap-3 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                                        depBlocked
                                          ? "bg-amber-500/10 border border-amber-500/30"
                                          : "bg-muted/30 hover:bg-muted/50"
                                      }`}
                                    >
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <CornerDownRight className="h-3 w-3 text-muted-foreground shrink-0" />
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
                                          <Badge variant="secondary" className="text-[10px]">
                                            Dự án khác ({dep.projectKey || dep.jiraKey.split("-")[0]})
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
                                        <span className="line-clamp-1 text-muted-foreground text-xs">
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
                    <div className="overflow-x-auto rounded-xl border border-border/50">
                      <table className="w-full text-xs">
                        <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                          <tr>
                            <th className="py-2.5 px-3">Issue Key</th>
                            <th className="py-2.5 px-3">Phân loại</th>
                            <th className="py-2.5 px-3">Tiêu đề</th>
                            <th className="py-2.5 px-3">Cảnh báo</th>
                            <th className="py-2.5 px-3">Trạng thái</th>
                            <th className="py-2.5 px-3 text-right">Điểm</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {allTasks.filter(filterFn).length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                                Không có task nào khớp bộ lọc.
                              </td>
                            </tr>
                          ) : (
                            allTasks.filter(filterFn).map((t) => {
                              const isDep = t.inclusion === "dependency";
                              return (
                                <tr key={t.jiraKey} className="hover:bg-muted/20">
                                  <td className="py-2.5 px-3 font-mono font-semibold">
                                    <Link
                                      href={`/issue/${t.jiraKey}`}
                                      className="text-teal-600 dark:text-teal-400 hover:underline"
                                    >
                                      {t.jiraKey}
                                    </Link>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {isDep ? (
                                      <Badge variant="outline" className="text-[10px]">
                                        Cấp {t.depth ?? 1}
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary" className="text-[10px]">
                                        Trực tiếp
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 max-w-sm truncate text-foreground">
                                    {t.issue.summary}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex flex-wrap gap-1">
                                      {t.sameProject === false && (
                                        <Badge variant="secondary" className="text-[10px]">
                                          Dự án khác
                                        </Badge>
                                      )}
                                      {t.hasReleaseVersion === false && (
                                        <Badge variant="danger" className="text-[10px]">
                                          Thiếu version
                                        </Badge>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <Badge
                                      variant={
                                        DONE_CATEGORIES.includes(t.issue.statusCategory)
                                          ? "success"
                                          : "secondary"
                                      }
                                      className="text-[10px]"
                                    >
                                      {t.issue.status}
                                    </Badge>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono">
                                    {t.issue.points ?? "—"}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* TAB 4: CHANGELOG & RELEASE NOTES */}
                <TabsContent value="notes" className="mt-4 flex flex-col gap-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    {/* Auto-generated Changelog */}
                    <div className="rounded-xl border border-border/60 bg-muted/10 p-4 text-xs flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5 font-bold text-foreground">
                            <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                            Changelog tự động từ Tasks hoàn thành
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyChangelog(rel, allTasks)}
                            className="h-7 text-xs gap-1 cursor-pointer"
                          >
                            {copiedChangelog === rel.id ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-500" />
                                Đã chép
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                Sao chép
                              </>
                            )}
                          </Button>
                        </div>

                        <div className="rounded-lg bg-background border p-3 max-h-60 overflow-y-auto font-mono text-[11px] leading-relaxed">
                          <p className="font-bold text-foreground mb-1"># Release v{rel.version}</p>
                          {allTasks
                            .filter((t) => DONE_CATEGORIES.includes(t.issue.statusCategory))
                            .map((t) => (
                              <div key={t.jiraKey} className="text-muted-foreground truncate">
                                - [{t.jiraKey}] {t.issue.summary} ({t.issue.points ?? 0} pts)
                              </div>
                            ))}
                          {doneCount === 0 && (
                            <p className="text-muted-foreground/60 italic">Chưa có task nào hoàn thành để tạo changelog.</p>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Bạn có thể sao chép nhanh nội dung trên để gửi thông báo qua Discord/Slack hoặc dán vào tài liệu phát hành.
                      </p>
                    </div>

                    {/* Custom Release Notes Editor */}
                    <div className="rounded-xl border border-border/60 bg-muted/10 p-4 text-xs flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5 font-bold text-foreground">
                            <FileText className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                            Ghi chú phát hành nội bộ
                          </div>
                          <Button
                            size="sm"
                            disabled={savingNotes[rel.id]}
                            onClick={() => saveNotes(rel.id)}
                            className="h-7 text-xs gap-1 bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
                          >
                            {savingNotes[rel.id] ? "Đang lưu…" : "Lưu ghi chú"}
                          </Button>
                        </div>

                        <Textarea
                          value={editingNotes[rel.id] !== undefined ? editingNotes[rel.id] : rel.notes}
                          onChange={(e) =>
                            setEditingNotes((prev) => ({ ...prev, [rel.id]: e.target.value }))
                          }
                          placeholder="Nhập ghi chú đặc biệt cho đợt phát hành này (hướng dẫn migration, cấu hình môi trường, lưu ý hotfix)..."
                          className="min-h-[140px] text-xs bg-background"
                        />
                      </div>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Ghi chú này được lưu trực tiếp vào cơ sở dữ liệu để phục vụ kiểm toán và tra cứu nội bộ.
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        );
      })}

      {/* MODAL: Create Release Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Tạo bản phát hành mới
              {projectKey && (
                <span className="font-mono text-teal-600 dark:text-teal-400">· {projectKey}</span>
              )}
            </DialogTitle>
            <DialogDescription>
              Bản phát hành được liên kết với một Jira Fix Version. Các task mang Fix Version này sẽ tự động được gộp vào phạm vi kiểm tra.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="version" className="text-xs font-semibold">
                Phiên bản (Version) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="ví dụ: 1.4.2 hoặc 2026.09.28"
                className="font-mono text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="projectKey" className="text-xs font-semibold">
                Dự án Jira (Project Key)
              </Label>
              {projectList.length > 0 ? (
                <Select
                  value={projectKey}
                  onValueChange={(val) => {
                    setProjectKey(val);
                    setLinkVersionId("");
                    loadVersions(val);
                  }}
                >
                  <SelectTrigger id="projectKey" className="font-mono text-xs">
                    <SelectValue placeholder="Chọn dự án Jira" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectList.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.key} ({p.releaseCount} releases)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="projectKey"
                  value={projectKey}
                  onChange={(e) => {
                    const next = e.target.value.toUpperCase();
                    setProjectKey(next);
                    setLinkVersionId("");
                    loadVersions(next.trim());
                  }}
                  placeholder="ví dụ: EPM, CORE, APP"
                  className="font-mono text-sm"
                />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="linkVersion" className="text-xs font-semibold">
                Liên kết Fix Version có sẵn trên Jira ({projectKey || "Chưa chọn dự án"})
              </Label>
              {projectKey.trim() ? (
                versions.length === 0 ? (
                  <p className="text-xs text-muted-foreground rounded border border-dashed p-2">
                    {versionsLoading
                      ? "Đang truy vấn Jira…"
                      : "Chưa có Fix Version nào — hệ thống sẽ tự động tạo mới trên Jira khi phát hành."}
                  </p>
                ) : (
                  <Select value={linkVersionId} onValueChange={setLinkVersionId}>
                    <SelectTrigger id="linkVersion">
                      <SelectValue placeholder="Tự động tạo Fix Version mới" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">-- Tự tạo mới Fix Version --</SelectItem>
                      {versions.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name} {v.released ? "(đã phát hành)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              ) : (
                <p className="text-xs text-muted-foreground">Chọn dự án để tải danh sách Fix Version.</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description" className="text-xs font-semibold">
                Mô tả phiên bản (Tuỳ chọn)
              </Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả mục tiêu của đợt phát hành này"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="cursor-pointer">
              Huỷ
            </Button>
            <Button
              onClick={createRelease}
              disabled={!version.trim() || !projectKey.trim() || versionsLoading}
              className="bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
            >
              Tạo bản phát hành
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Sign-off Approval */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Ký duyệt phát hành (Sign-off)
            </DialogTitle>
            <DialogDescription>
              Ký duyệt xác nhận tính sẵn sàng của phiên bản <strong>v{approvalTargetRelease?.version}</strong> (
              {approvalTargetRelease?.projectKey}).
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Vai trò ký duyệt</Label>
              <Select value={approvalType} onValueChange={(v: any) => setApprovalType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qa">Đội ngũ QA (QA Approval)</SelectItem>
                  <SelectItem value="release_manager">Quản lý phát hành (Release Manager)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="approvalNote" className="text-xs font-semibold">
                Ghi chú phê duyệt (Tuỳ chọn)
              </Label>
              <Textarea
                id="approvalNote"
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Xác nhận đã test hoàn tất hoặc lưu ý đặc biệt..."
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalDialogOpen(false)} className="cursor-pointer">
              Đóng
            </Button>
            <Button
              onClick={handleAddApproval}
              disabled={submittingApproval}
              className="bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
            >
              {submittingApproval ? "Đang xử lý…" : "Xác nhận ký duyệt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Gate Override */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <ShieldOff className="h-5 w-5" />
              Miễn trừ cổng kiểm tra (Gate Override)
            </DialogTitle>
            <DialogDescription>
              Bỏ qua kết quả thất bại của cổng để tiếp tục phát hành. Mọi hành động miễn trừ sẽ được ghi vết kiểm toán (Audit Log).
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Cổng kiểm tra</Label>
              <Input value={gateLabel(overrideGate)} disabled className="bg-muted text-xs font-semibold" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="overrideReason" className="text-xs font-semibold">
                Lý do miễn trừ <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="overrideReason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Bắt buộc: Nêu rõ lý do chấp nhận rủi ro và ai đã phê duyệt ngoại lệ này..."
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)} className="cursor-pointer">
              Huỷ
            </Button>
            <Button
              onClick={handleAddOverride}
              disabled={submittingOverride || !overrideReason.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
            >
              {submittingOverride ? "Đang xử lý…" : "Xác nhận miễn trừ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Check History */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Lịch sử kiểm tra sẵn sàng (v{historyTargetRelease?.version} · {historyTargetRelease?.projectKey})
            </DialogTitle>
            <DialogDescription>
              Nhật ký kiểm tra chất lượng tự động được lưu trữ theo thời gian.
            </DialogDescription>
          </DialogHeader>

          {historyLoading ? (
            <div className="flex flex-col gap-2 py-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : historyList.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Chưa có lịch sử kiểm tra nào.</p>
          ) : (
            <div className="flex flex-col gap-3 py-2 divide-y divide-border/40">
              {historyList.map((h) => (
                <div key={h.id} className="pt-3 first:pt-0 flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={h.status === "ready" ? "success" : h.status === "blocked" ? "danger" : "warning"}>
                        {h.status === "ready" ? "SẴN SÀNG" : h.status === "blocked" ? "BỊ CHẶN" : h.status}
                      </Badge>
                      <span className="font-semibold text-foreground">
                        {h.triggeredBy ? `Thực hiện bởi ${h.triggeredBy}` : "Kiểm tra tự động"}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{timeAgo(h.createdAt)}</span>
                  </div>

                  <p className="text-muted-foreground text-[11px]">{h.summary}</p>

                  {h.gates && h.gates.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {h.gates.map((g) => (
                        <span
                          key={g.id}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono border ${
                            g.state === "passed"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : g.state === "failed"
                              ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                              : "border-border bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          {gateLabel(g.gate)}: {g.state}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDialogOpen(false)} className="cursor-pointer">
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Fix Version Sync */}
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
              className="gap-1.5 cursor-pointer bg-teal-600 hover:bg-teal-700 text-white"
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
