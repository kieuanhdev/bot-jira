"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { transitionsKeys, branchesForKeys, meKeys, issuesKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { wikiToHtml } from "@/lib/wiki";
import {
  Bot,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  GitBranch,
  Send,
  X,
  Pencil,
  AlertTriangle,
  Info,
  User,
  UserCheck,
  Hash,
  Flag,
  Plus,
  ChevronDown,
  CornerDownLeft,
  ExternalLink,
} from "lucide-react";

import { IssueDependencies } from "@/components/issue-dependencies";

type IssueDetail = {
  jiraKey: string;
  summary: string;
  description: string;
  status: string;
  assigneeJira: string | null;
  labels: string[];
  fixVersions?: string[];
  priority: string;
  points: number | null;
  type: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastSyncedAt: string;
  aiScore: {
    points: number;
    confidence: number | null;
    reasoning: string;
    risks: string[];
    missingInformation: string[];
    similarTasks: string[];
    model: string;
    promptVersion: string | null;
    scoredAt: string;
  } | null;
  aiDecision: { decision: string; finalPoints: number | null; decidedAt: string } | null;
  comments: { id: string; author: string; body: string; createdAt: string | null }[];
  releaseTasks: { release: { version: string; status: string } }[];
  staleSnapshots: {
    ageDays: number;
    detectedAt: string;
    staleReason: string;
    severity: string;
    stateAgeDays: number;
    blockedDays: number;
  }[];
};

type Transition = { id: string; name: string; to?: { name?: string } | string };

function transitionTo(t: Transition): string {
  return typeof t.to === "string" ? t.to : t.to?.name ?? t.name ?? "";
}
type BranchRow = {
  id?: string;
  repo: string;
  branch: string;
  merged: boolean;
  lastCommitAt: string | null;
  prId?: number | null;
  prTitle?: string | null;
  prUrl?: string | null;
  prState?: string | null;
  prDestinationBranch?: string | null;
  linkSource?: string | null;
  linkConfidence?: number | null;
  checkedAt?: string;
};

export function IssueDetailClient({ issue: initial }: { issue: IssueDetail }) {
  const [issue, setIssue] = useState<IssueDetail>(initial);
  const [watched, setWatched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editPoints, setEditPoints] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [newLabelInput, setNewLabelInput] = useState("");
  const [showAddLabel, setShowAddLabel] = useState(false);
  const [newVersionInput, setNewVersionInput] = useState("");
  const [showAddVersion, setShowAddVersion] = useState(false);
  const priorities = ["Blocker", "Highest", "High", "Medium", "Low", "Lowest"];
  const projectKey = issue.jiraKey.split("-")[0];

  const { data: transitions } = useQuery({
    queryKey: transitionsKeys.forIssue(issue.jiraKey),
    queryFn: () => api<{ transitions: Transition[] }>(`/api/issues/${issue.jiraKey}/transitions`),
    retry: 1,
  });

  const queryClient = useQueryClient();

  const { data: me } = useQuery({
    queryKey: meKeys.status,
    queryFn: () => api<{ jiraName: string | null; jiraBaseUrl?: string }>("/api/me/status"),
    staleTime: 60_000,
  });

  const { data: filterOpts } = useQuery({
    queryKey: issuesKeys.filters(projectKey),
    queryFn: () => api<{ assignees: string[]; priorities: string[] }>(`/api/issues/filters?project=${projectKey}`),
    staleTime: 60_000,
  });

  const { data: projectVersions } = useQuery({
    queryKey: issuesKeys.versions(issue.jiraKey),
    queryFn: () => api<{ items: { id: string; name: string }[] }>(`/api/issues/${issue.jiraKey}/versions`),
    staleTime: 60_000,
  });

  const { data: branches } = useQuery({
    queryKey: branchesForKeys.forIssue(issue.jiraKey),
    queryFn: () =>
      api<{ items: BranchRow[]; suggestedItems?: (BranchRow & { id: string })[] }>(
        `/api/issues/${issue.jiraKey}/branches`
      ),
    staleTime: 15_000,
  });

  async function handleConfirmBranch(branchId: string) {
    try {
      const res = await fetch(`/api/branches/${branchId}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm" }),
      });
      if (!res.ok) throw new Error("Không thể xác nhận");
      await queryClient.invalidateQueries({ queryKey: branchesForKeys.forIssue(issue.jiraKey) });
      setMsg("Đã xác nhận liên kết nhánh");
    } catch (e) {
      setMsg(`Lỗi: ${(e as Error).message}`);
    }
  }

  async function handleRejectBranch(branchId: string) {
    try {
      const res = await fetch(`/api/branches/${branchId}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      if (!res.ok) throw new Error("Không thể từ chối");
      await queryClient.invalidateQueries({ queryKey: branchesForKeys.forIssue(issue.jiraKey) });
      setMsg("Đã từ chối gợi ý liên kết");
    } catch (e) {
      setMsg(`Lỗi: ${(e as Error).message}`);
    }
  }

  async function doAction(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(message);
      // Refresh the issue from the cache after the mutation invalidated it.
      const fresh = await api<{ issue: IssueDetail }>(`/api/issues/${issue.jiraKey}`);
      setIssue(fresh.issue);
      await queryClient.invalidateQueries({ queryKey: issuesKeys.all });
    } catch (e) {
      setMsg(`Lỗi: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleMutateField(patch: Record<string, unknown>, successMsg?: string) {
    await doAction(
      () => api(`/api/issues/${issue.jiraKey}`, { method: "PATCH", body: patch }),
      successMsg ?? "Đã cập nhật task thành công"
    );
  }

  async function handleAssign(assignee: string | null) {
    await handleMutateField({ assignee }, assignee ? `Đã gán cho ${assignee}` : "Đã hủy gán");
  }

  async function handleSetPoints(points: number | null) {
    await handleMutateField({ points }, points != null ? `Đã đặt điểm thành ${points}` : "Đã xóa điểm");
  }

  async function handleSetPriority(priority: string) {
    await handleMutateField({ priority }, `Đã đổi độ ưu tiên thành ${priority}`);
  }

  async function handleAddVersion(ver: string) {
    const val = ver.trim();
    if (!val) return;
    await handleMutateField({ addFixVersion: val }, `Đã thêm phiên bản ${val}`);
    setNewVersionInput("");
    setShowAddVersion(false);
  }

  async function handleRemoveVersion(ver: string) {
    await handleMutateField({ removeFixVersion: ver }, `Đã gỡ phiên bản ${ver}`);
  }

  async function handleAddLabel(l?: string) {
    const val = (l ?? newLabelInput).trim();
    if (!val) return;
    await handleMutateField({ addLabel: val }, `Đã thêm nhãn ${val}`);
    setNewLabelInput("");
    setShowAddLabel(false);
  }

  async function handleRemoveLabel(l: string) {
    await handleMutateField({ removeLabel: l }, `Đã gỡ nhãn ${l}`);
  }

  async function handleCreateBranch() {
    setCreatingBranch(true);
    setMsg(null);
    try {
      const res = await api<{ ok: boolean; branch?: string; error?: string }>(
        `/api/issues/${issue.jiraKey}/branches`,
        { method: "POST", body: {} }
      );
      await queryClient.invalidateQueries({ queryKey: branchesForKeys.forIssue(issue.jiraKey) });
      setMsg(`Đã tạo thành công nhánh: ${res.branch}`);
    } catch (e) {
      setMsg(`Lỗi tạo nhánh: ${(e as Error).message}`);
    } finally {
      setCreatingBranch(false);
    }
  }

  async function onTransition(t: Transition) {
    await doAction(
      () =>
        api(`/api/issues/${issue.jiraKey}/transition`, {
          method: "POST",
          body: { transitionId: t.id },
        }),
      `Đã chuyển sang ${transitionTo(t)}`
    );
  }

  async function onToggleWatch() {
    await doAction(
      () => api(`/api/issues/${issue.jiraKey}/watch`, { method: "POST", body: {} }),
      watched ? "Đã bỏ theo dõi" : "Đang theo dõi"
    );
    setWatched((w) => !w);
  }

  async function onAiScore() {
    setBusy(true);
    setMsg("Đang chấm điểm AI…");
    try {
      await api(`/api/issues/${issue.jiraKey}/ai-score`, { method: "POST", body: {} });
      const fresh = await api<{ issue: IssueDetail }>(`/api/issues/${issue.jiraKey}`);
      setIssue(fresh.issue);
      setMsg("Điểm AI đã sẵn sàng");
    } catch (e) {
      setMsg(`Lỗi: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onAiDecision(decision: "accepted" | "edited" | "rejected", points?: number) {
    if (!issue.aiScore) return;
    const done =
      decision === "accepted"
        ? `Đã chấp nhận điểm AI (${issue.aiScore.points}) → Jira`
        : decision === "edited"
          ? `Đã đặt điểm thành ${points} → Jira`
          : "Đã từ chối ước tính AI (Jira không thay đổi)";
    await doAction(
      () =>
        api(`/api/issues/${issue.jiraKey}/ai-score/decision`, {
          method: "POST",
          body: { decision, points },
        }),
      done
    );
    if (decision !== "rejected") {
      setEditMode(false);
      setEditPoints("");
    }
  }

  function startEdit() {
    if (!issue.aiScore) return;
    setEditPoints(String(issue.points ?? issue.aiScore.points ?? ""));
    setEditMode(true);
  }

  async function onAddComment() {
    const text = commentDraft.trim();
    if (!text) return;
    setCommenting(true);
    setMsg(null);
    try {
      await api(`/api/issues/${issue.jiraKey}/comments`, {
        method: "POST",
        body: { body: text },
      });
      setCommentDraft("");
      setMsg("Đã gửi bình luận lên Jira");
      const fresh = await api<{ issue: IssueDetail }>(`/api/issues/${issue.jiraKey}`);
      setIssue(fresh.issue);
    } catch (e) {
      setMsg(`Lỗi: ${(e as Error).message}`);
    } finally {
      setCommenting(false);
    }
  }

  const stale = issue.staleSnapshots[0];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{issue.jiraKey}</span>
            <Badge>{issue.status}</Badge>
            {issue.points != null && <Badge variant="secondary">{issue.points} điểm</Badge>}
            {stale && (
              <Badge variant={stale.severity === "high" ? "danger" : stale.severity === "info" ? "info" : "warning"}>
                {stale.staleReason.replace(/_/g, " ")} · {stale.stateAgeDays} ngày
              </Badge>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{issue.summary}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{issue.type}</span>
            {issue.priority && <span>· {issue.priority}</span>}
            {issue.assigneeJira && <span>· {issue.assigneeJira}</span>}
            <span>· cập nhật {timeAgo(issue.updatedAt)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onToggleWatch}
            className="gap-1.5"
          >
            {watched ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {watched ? "Đang theo dõi" : "Theo dõi"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default" size="sm" disabled={busy || !transitions?.transitions?.length}>
                <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                Chuyển sang…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              <DropdownMenuLabel>Chuyển trạng thái</DropdownMenuLabel>
              {transitions?.transitions?.map((t) => (
                <DropdownMenuItem key={t.id} disabled={busy} onClick={() => onTransition(t)}>
                  {transitionTo(t)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Quick Action Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5 shadow-sm">
        {/* Assignee Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{issue.assigneeJira ? `Gán: ${issue.assigneeJira}` : "Chưa gán ai"}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto">
            <DropdownMenuLabel className="text-xs">Gán người thực hiện</DropdownMenuLabel>
            {me?.jiraName && (
              <DropdownMenuItem
                onClick={() => handleAssign(me.jiraName)}
                className="gap-2 text-xs font-medium text-primary"
              >
                <UserCheck className="h-3.5 w-3.5" /> Gán cho tôi ({me.jiraName})
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => handleAssign(null)} className="gap-2 text-xs text-muted-foreground">
              <User className="h-3.5 w-3.5" /> Hủy gán (Unassigned)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {(filterOpts?.assignees ?? []).map((a) => (
              <DropdownMenuItem key={a} onClick={() => handleAssign(a)} className="gap-2 text-xs">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{a}</span>
                {a === issue.assigneeJira && <span className="ml-auto text-primary font-bold">•</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Quick Assign to me button */}
        {me?.jiraName && issue.assigneeJira !== me.jiraName && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleAssign(me.jiraName)}
            className="gap-1.5 text-xs text-primary hover:bg-primary/10"
            title={`Gán nhanh cho tôi (${me.jiraName})`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            Gán cho tôi
          </Button>
        )}

        {/* Priority Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Flag className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{issue.priority || "Độ ưu tiên"}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            <DropdownMenuLabel className="text-xs">Độ ưu tiên</DropdownMenuLabel>
            {priorities.map((p) => (
              <DropdownMenuItem key={p} onClick={() => handleSetPriority(p)} className="gap-2 text-xs">
                <Flag className="h-3.5 w-3.5" /> {p}
                {p === issue.priority && <span className="ml-auto text-primary font-bold">•</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Story Points Picker */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{issue.points != null ? `${issue.points} pt` : "Đặt điểm"}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuLabel className="text-xs">Story Points</DropdownMenuLabel>
            <div className="grid grid-cols-4 gap-1 p-1">
              {[1, 2, 3, 5, 8, 13, 21].map((p) => (
                <Button
                  key={p}
                  variant={issue.points === p ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-0 text-xs"
                  onClick={() => handleSetPoints(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleSetPoints(null)} className="text-xs text-destructive">
              Xóa điểm (None)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Create Bitbucket Branch */}
        <Button
          variant="outline"
          size="sm"
          disabled={creatingBranch}
          onClick={handleCreateBranch}
          className="gap-1.5 text-xs ml-auto"
          title="Tạo nhánh Bitbucket theo chuẩn quy ước của team"
        >
          {creatingBranch ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : (
            <GitBranch className="h-3.5 w-3.5 text-primary" />
          )}
          {creatingBranch ? "Đang tạo nhánh…" : "Tạo nhánh Git"}
        </Button>
      </div>

      {/* Fix Versions & Labels Interactive Bar */}
      <div className="flex flex-wrap items-center gap-6 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
        {/* Fix Versions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-muted-foreground">Fix Version:</span>
          {(issue.fixVersions ?? issue.releaseTasks.map((rt) => rt.release.version)).length === 0 && !showAddVersion && (
            <span className="italic text-muted-foreground">Chưa có</span>
          )}
          {(issue.fixVersions ?? issue.releaseTasks.map((rt) => rt.release.version)).map((v) => (
            <Badge key={v} variant="info" className="gap-1 text-[11px]">
              {v}
              <button
                onClick={() => handleRemoveVersion(v)}
                className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                title={`Gỡ ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {showAddVersion ? (
            <div className="flex items-center gap-1">
              {projectVersions?.items && projectVersions.items.length > 0 ? (
                <Select onValueChange={(val) => handleAddVersion(val)}>
                  <SelectTrigger className="h-6 w-32 text-xs">
                    <SelectValue placeholder="Chọn version…" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectVersions.items.map((pv) => (
                      <SelectItem key={pv.id} value={pv.name} className="text-xs">
                        {pv.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  autoFocus
                  value={newVersionInput}
                  onChange={(e) => setNewVersionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddVersion(newVersionInput);
                    if (e.key === "Escape") setShowAddVersion(false);
                  }}
                  placeholder="1.0.0"
                  className="h-6 w-24 text-xs px-1.5"
                />
              )}
              {!projectVersions?.items?.length && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleAddVersion(newVersionInput)}
                >
                  Lưu
                </Button>
              )}
              <button
                onClick={() => setShowAddVersion(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddVersion(true)}
              className="flex items-center gap-0.5 text-primary hover:underline font-medium"
            >
              <Plus className="h-3 w-3" /> Thêm version
            </button>
          )}
        </div>

        {/* Labels */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-muted-foreground">Nhãn:</span>
          {issue.labels.length === 0 && !showAddLabel && (
            <span className="italic text-muted-foreground">Không có</span>
          )}
          {issue.labels.map((l) => (
            <Badge key={l} variant="outline" className="gap-1 text-[11px]">
              {l}
              <button
                onClick={() => handleRemoveLabel(l)}
                className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                title={`Xóa nhãn ${l}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {showAddLabel ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={newLabelInput}
                onChange={(e) => setNewLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddLabel();
                  if (e.key === "Escape") setShowAddLabel(false);
                }}
                placeholder="Tên nhãn…"
                className="h-6 w-24 text-xs px-1.5"
              />
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => handleAddLabel()}>
                Lưu
              </Button>
              <button
                onClick={() => setShowAddLabel(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddLabel(true)}
              className="flex items-center gap-0.5 text-primary hover:underline font-medium"
            >
              <Plus className="h-3 w-3" /> Thêm nhãn
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">{msg}</div>
      )}

      <Tabs defaultValue="detail">
        <TabsList>
          <TabsTrigger value="detail">Chi tiết</TabsTrigger>
          <TabsTrigger value="dependencies">Phụ thuộc</TabsTrigger>
          <TabsTrigger value="comments">Bình luận ({issue.comments.length})</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="branches">Nhánh</TabsTrigger>
        </TabsList>

        <TabsContent value="detail" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Mô tả</CardTitle></CardHeader>
            <CardContent>
              {issue.description ? (
                <div
                  className="wiki-content text-sm"
                  dangerouslySetInnerHTML={{ __html: wikiToHtml(issue.description) }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
              <Separator className="my-4" />
              <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
                <div><span className="font-medium">Đã tạo:</span> {formatDateTime(issue.createdAt)}</div>
                <div><span className="font-medium">Cập nhật:</span> {formatDateTime(issue.updatedAt)}</div>
                <div><span className="font-medium">Đồng bộ lần cuối:</span> {timeAgo(issue.lastSyncedAt)}</div>
              </div>
            </CardContent>
          </Card>

          <IssueDependencies
            jiraKey={issue.jiraKey}
            rootProjectKey={issue.jiraKey.split("-")[0]}
            rootFixVersionNames={issue.releaseTasks.map((rt) => rt.release.version)}
          />
        </TabsContent>

        <TabsContent value="dependencies">
          <IssueDependencies
            jiraKey={issue.jiraKey}
            rootProjectKey={issue.jiraKey.split("-")[0]}
            rootFixVersionNames={issue.releaseTasks.map((rt) => rt.release.version)}
          />
        </TabsContent>

        <TabsContent value="comments">
          <div className="flex flex-col gap-3">
            <Card>
              <CardContent className="p-4">
                <Textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Thêm bình luận lên Jira…"
                  rows={3}
                  className="resize-y"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    disabled={commenting || !commentDraft.trim()}
                    onClick={onAddComment}
                    className="gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {commenting ? "Đang gửi…" : "Bình luận"}
                  </Button>
                </div>
              </CardContent>
            </Card>
            {issue.comments.length === 0 && (
              <Card><CardContent className="text-sm text-muted-foreground">Chưa có bình luận nào.</CardContent></Card>
            )}
            {issue.comments.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="mb-1 flex items-center gap-2 text-sm">
                    <span className="font-medium">{c.author}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                  </div>
                    <div
                      className="wiki-content text-sm"
                      dangerouslySetInnerHTML={{ __html: wikiToHtml(c.body) }}
                    />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-4 w-4" /> Chấm điểm task bằng AI
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!issue.aiScore ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Chưa có điểm AI.</p>
                  <Button onClick={onAiScore} disabled={busy}>
                    <Bot className="h-4 w-4" /> Chấm điểm task này
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-lg bg-primary/10 px-4 py-2 text-2xl font-bold text-primary">
                      {issue.aiScore.points} điểm
                    </div>
                    {issue.aiScore.confidence != null && (
                      <Badge variant={issue.aiScore.confidence >= 0.7 ? "success" : issue.aiScore.confidence >= 0.4 ? "warning" : "danger"}>
                        {(issue.aiScore.confidence * 100).toFixed(0)}% độ tin cậy
                      </Badge>
                    )}
                    <div className="text-xs text-muted-foreground">{issue.aiScore.model}</div>
                  </div>
                  <p className="text-sm">{issue.aiScore.reasoning}</p>

                  {issue.aiScore.missingInformation?.length > 0 && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" /> Thông tin còn thiếu
                      </p>
                      <ul className="list-inside list-disc text-sm">
                        {issue.aiScore.missingInformation.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}

                  {issue.aiScore.risks?.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Rủi ro tiềm ẩn</p>
                      <ul className="list-inside list-disc text-sm">
                        {issue.aiScore.risks.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}

                  {issue.aiScore.similarTasks?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Các task tương tự:</span>
                      {issue.aiScore.similarTasks.map((k, i) => (
                        <Badge key={i} variant="outline">{k}</Badge>
                      ))}
                    </div>
                  )}

                  {issue.aiDecision && (
                    <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      {issue.aiDecision.decision === "accepted" && "Đã chấp nhận ước tính điểm AI."}
                      {issue.aiDecision.decision === "edited" && `Đã chỉnh sửa thành ${issue.aiDecision.finalPoints} điểm và áp dụng.`}
                      {issue.aiDecision.decision === "rejected" && "Đã từ chối ước tính AI (Jira không thay đổi)."}
                    </div>
                  )}

                  {editMode ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-sm text-muted-foreground">Điểm</label>
                      <Input
                        type="number"
                        min={1}
                        value={editPoints}
                        onChange={(e) => setEditPoints(e.target.value)}
                        className="w-24"
                      />
                      <Button size="sm" disabled={busy} onClick={() => onAiDecision("edited", Number(editPoints))}>
                        <Check className="h-4 w-4" /> Áp dụng {editPoints || "?"} điểm → Jira
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditMode(false)}>
                        Huỷ
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={onAiScore} disabled={busy}>
                        <RefreshCw className="h-4 w-4" /> Chấm điểm lại
                      </Button>
                      <Button variant="outline" onClick={() => onAiDecision("accepted")} disabled={busy}>
                        <Check className="h-4 w-4" /> Chấp nhận {issue.aiScore.points} điểm → Jira
                      </Button>
                      <Button variant="outline" onClick={startEdit} disabled={busy}>
                        <Pencil className="h-4 w-4" /> Sửa điểm
                      </Button>
                      <Button variant="outline" onClick={() => onAiDecision("rejected")} disabled={busy}>
                        <X className="h-4 w-4" /> Từ chối
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branches">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" /> Các nhánh liên quan
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
                <Link href={`/branches?q=${encodeURIComponent(issue.jiraKey)}`}>
                  Xem trong không gian làm việc Nhánh →
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {branches?.items?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pl-1">Nhánh</th>
                        <th>Repository</th>
                        <th>Pull Request</th>
                        <th>Trạng thái</th>
                        <th>Hoạt động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {branches.items.map((b, i) => (
                        <tr key={i} className="last:border-0 hover:bg-muted/30">
                          <td className="py-2 pl-1 font-mono text-xs font-semibold text-foreground">
                            {b.branch}
                          </td>
                          <td className="text-xs text-muted-foreground">{b.repo}</td>
                          <td className="text-xs">
                            {b.prState ? (
                              <div className="flex items-center gap-1.5">
                                {b.prUrl ? (
                                  <a
                                    href={b.prUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-primary hover:underline"
                                  >
                                    #{b.prId}
                                  </a>
                                ) : (
                                  <span>#{b.prId}</span>
                                )}
                                <Badge
                                  variant={
                                    b.prState === "OPEN"
                                      ? "info"
                                      : b.prState === "MERGED"
                                      ? "success"
                                      : b.prState === "DECLINED"
                                      ? "danger"
                                      : "outline"
                                  }
                                  className="h-4 px-1 text-[10px]"
                                >
                                  {b.prState}
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Chưa có PR</span>
                            )}
                          </td>
                          <td>
                            {b.merged ? (
                              <Badge variant="success">đã merge</Badge>
                            ) : (
                              <Badge variant="outline">đang hoạt động</Badge>
                            )}
                          </td>
                          <td className="text-xs text-muted-foreground">
                            {timeAgo(b.lastCommitAt ?? b.checkedAt ?? null)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <GitBranch className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Chưa có nhánh nào được liên kết</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Các nhánh Bitbucket chứa mã issue này sẽ tự động được liên kết vào lần đồng bộ tiếp theo.
                  </p>
                </div>
              )}

              {/* Suggested Branches Section if any */}
              {branches?.suggestedItems && branches.suggestedItems.length > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Nhánh gợi ý ({branches.suggestedItems.length})
                    </span>
                    <Button asChild variant="outline" size="sm" className="h-6 text-xs border-amber-500/30 text-amber-600 dark:text-amber-400">
                      <Link href={`/branches?link=suggested&q=${encodeURIComponent(issue.jiraKey)}`}>
                        Xem xét trong mục Nhánh →
                      </Link>
                    </Button>
                  </div>
                  <div className="divide-y divide-amber-500/20 text-xs">
                    {branches.suggestedItems.map((sb, idx) => (
                      <div key={idx} className="flex items-center justify-between py-2 gap-2">
                        <div className="flex flex-col gap-0.5 font-mono">
                          <span className="font-semibold text-foreground">{sb.branch}</span>
                          <span className="text-[11px] text-muted-foreground">{sb.repo}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="warning">Chờ xác nhận</Badge>
                          {sb.id && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleConfirmBranch(sb.id)}
                                className="h-6 px-2 text-[11px] bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 border-teal-500/30 cursor-pointer"
                              >
                                Xác nhận
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRejectBranch(sb.id)}
                                className="h-6 px-2 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
                              >
                                Từ chối
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
