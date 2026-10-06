"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getErrorMessage } from "@/lib/api-client";
import { useBranchLink } from "@/hooks/use-branches";
import {
  useIssueFieldMutation,
  useIssueTransition,
  useIssueWatch,
  useIssueAiScore,
  useIssueAiDecision,
  useIssueComment,
  useIssueCreateBranch,
  useIssueWorklog,
} from "@/hooks/use-issue-detail";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { transitionsKeys, branchesForKeys, meKeys, issuesKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatDateTime, timeAgo, cn, getJiraIssueUrl, getBitbucketBranchUrl } from "@/lib/utils";
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
  Clock,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  parseJiraDuration,
  formatJiraDuration,
  isSafeReturnUrl,
} from "@/lib/worklogs/schema";

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
  timeSpentSeconds?: number | null;
  originalEstimateSeconds?: number | null;
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
  linkState?: string;
  checkedAt?: string;
};

type MsgState = { tone: "success" | "destructive" | "info"; text: string } | null;

export function IssueDetailClient({ issue: initial }: { issue: IssueDetail }) {
  const [issue, setIssue] = useState<IssueDetail>(initial);
  const [watched, setWatched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<MsgState>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editPoints, setEditPoints] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [newLabelInput, setNewLabelInput] = useState("");
  const [showAddLabel, setShowAddLabel] = useState(false);
  const [newVersionInput, setNewVersionInput] = useState("");
  const [showAddVersion, setShowAddVersion] = useState(false);

  // Log Work dialog state
  const [logWorkOpen, setLogWorkOpen] = useState(false);
  const [logTimeSpent, setLogTimeSpent] = useState("");
  const [logStartedAt, setLogStartedAt] = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [logComment, setLogComment] = useState("");
  const [submittingWorklog, setSubmittingWorklog] = useState(false);
  const [worklogError, setWorklogError] = useState<string | null>(null);
  const [worklogIdempotencyKey, setWorklogIdempotencyKey] = useState(() => crypto.randomUUID());

  const searchParams = useSearchParams();
  const router = useRouter();
  const actionParam = searchParams?.get("action");
  const returnToParam = searchParams?.get("returnTo");

  useEffect(() => {
    if (actionParam === "log-work") {
      setLogWorkOpen(true);
    }
  }, [actionParam]);

  const priorities = ["Blocker", "Highest", "High", "Medium", "Low", "Lowest"];
  const projectKey = issue.jiraKey.split("-")[0];

  const { data: transitions } = useQuery({
    queryKey: transitionsKeys.forIssue(issue.jiraKey),
    queryFn: () => api<{ transitions: Transition[] }>(`/api/issues/${issue.jiraKey}/transitions`),
    retry: 1,
  });

  const queryClient = useQueryClient();
  const branchLink = useBranchLink();
  const fieldMutation = useIssueFieldMutation(issue.jiraKey);
  const transitionMutation = useIssueTransition(issue.jiraKey);
  const watchMutation = useIssueWatch(issue.jiraKey);
  const aiScoreMutation = useIssueAiScore(issue.jiraKey);
  const aiDecisionMutation = useIssueAiDecision(issue.jiraKey);
  const commentMutation = useIssueComment(issue.jiraKey);
  const createBranchMutation = useIssueCreateBranch(issue.jiraKey);
  const worklogMutation = useIssueWorklog(issue.jiraKey);

  const { data: me } = useQuery({
    queryKey: meKeys.status,
    queryFn: () => api<{ jiraName: string | null; jiraBaseUrl?: string; bitbucketBaseUrl?: string }>("/api/me/status"),
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
      api<{ items: BranchRow[]; suggestedItems?: (BranchRow & { id: string })[]; bitbucketBaseUrl?: string | null }>(
        `/api/issues/${issue.jiraKey}/branches`
      ),
    staleTime: 15_000,
  });

  const jiraBaseUrl = me?.jiraBaseUrl ?? "";
  const bitbucketBaseUrl = branches?.bitbucketBaseUrl || me?.bitbucketBaseUrl || "";

  async function refreshIssue() {
    const fresh = await api<{ issue: IssueDetail }>(`/api/issues/${issue.jiraKey}`);
    setIssue(fresh.issue);
  }

  const syncDevStatusMutation = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; count: number }>(`/api/issues/${issue.jiraKey}/branches/sync`, {
        method: "POST",
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: branchesForKeys.forIssue(issue.jiraKey) });
      setMsg({
        tone: "success",
        text: `Đã đồng bộ thành công ${data.count ?? 0} nhánh từ Jira Dev-Status`,
      });
    },
    onError: (err) => {
      setMsg({
        tone: "destructive",
        text: getErrorMessage(err, "Không thể đồng bộ từ Jira Dev-Status"),
      });
    },
  });

  function handleConfirmBranch(branchId: string) {
    branchLink.mutate(
      { branchId, body: { action: "confirm" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: branchesForKeys.forIssue(issue.jiraKey) });
          setMsg({ tone: "success", text: "Đã xác nhận liên kết nhánh" });
        },
        onError: (err) => setMsg({ tone: "destructive", text: getErrorMessage(err, "Không thể xác nhận") }),
      }
    );
  }

  function handleRejectBranch(branchId: string) {
    branchLink.mutate(
      { branchId, body: { action: "reject" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: branchesForKeys.forIssue(issue.jiraKey) });
          setMsg({ tone: "success", text: "Đã từ chối gợi ý liên kết" });
        },
        onError: (err) => setMsg({ tone: "destructive", text: getErrorMessage(err, "Không thể từ chối") }),
      }
    );
  }

  async function handleSubmitWorklog() {
    const trimmedDuration = logTimeSpent.trim();
    const parsed = parseJiraDuration(trimmedDuration);
    if (!parsed || parsed <= 0) {
      setWorklogError("Thời lượng không hợp lệ. Vui lòng nhập đúng cú pháp Jira (ví dụ: 30m, 2h, 1d 4h).");
      return;
    }

    if (!logStartedAt) {
      setWorklogError("Thời điểm bắt đầu là bắt buộc.");
      return;
    }

    const startedDate = new Date(logStartedAt);
    if (isNaN(startedDate.getTime())) {
      setWorklogError("Thời điểm bắt đầu không hợp lệ.");
      return;
    }

    if (startedDate.getTime() - Date.now() > 5 * 60 * 1000) {
      setWorklogError("Thời điểm bắt đầu không được lớn hơn hiện tại quá 5 phút.");
      return;
    }

    setSubmittingWorklog(true);
    setWorklogError(null);

    try {
      const res = await worklogMutation.mutateAsync({
        timeSpent: trimmedDuration,
        startedAt: startedDate.toISOString(),
        comment: logComment.trim() || undefined,
        adjustEstimate: "leave",
        idempotencyKey: worklogIdempotencyKey,
      });

      const addedSeconds = res.timeSpentSeconds ?? parsed;
      setIssue((prev) => ({
        ...prev,
        timeSpentSeconds: (prev.timeSpentSeconds ?? 0) + addedSeconds,
      }));

      const syncNote = res.cacheSynced === false
        ? " (Jira đã ghi nhận, dữ liệu tổng hợp đang chờ đồng bộ)"
        : "";
      setMsg({ tone: "success", text: `Đã ghi nhận ${trimmedDuration} lên Jira thành công!${syncNote}` });

      setLogWorkOpen(false);
      setLogTimeSpent("");
      setLogComment("");
      setWorklogIdempotencyKey(crypto.randomUUID());

      if (returnToParam && isSafeReturnUrl(returnToParam)) {
        router.push(returnToParam);
      }
    } catch (err) {
      setWorklogError(getErrorMessage(err, "Có lỗi xảy ra khi ghi worklog lên Jira."));
    } finally {
      setSubmittingWorklog(false);
    }
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  async function handleMutateField(patch: Record<string, unknown>, successMsg?: string) {
    await withBusy(async () => {
      try {
        await fieldMutation.mutateAsync(patch);
        setMsg({ tone: "success", text: successMsg ?? "Đã cập nhật task thành công" });
        await refreshIssue();
      } catch (err) {
        setMsg({ tone: "destructive", text: getErrorMessage(err) });
      }
    });
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
      const res = await createBranchMutation.mutateAsync();
      setMsg({ tone: "success", text: `Đã tạo thành công nhánh: ${res.branch}` });
    } catch (err) {
      setMsg({ tone: "destructive", text: getErrorMessage(err, "Lỗi tạo nhánh") });
    } finally {
      setCreatingBranch(false);
    }
  }

  async function onTransition(t: Transition) {
    await withBusy(async () => {
      try {
        await transitionMutation.mutateAsync(t.id);
        setMsg({ tone: "success", text: `Đã chuyển sang ${transitionTo(t)}` });
        await refreshIssue();
      } catch (err) {
        setMsg({ tone: "destructive", text: getErrorMessage(err) });
      }
    });
  }

  async function onToggleWatch() {
    await withBusy(async () => {
      try {
        await watchMutation.mutateAsync();
        setMsg({ tone: "success", text: watched ? "Đã bỏ theo dõi" : "Đang theo dõi" });
      } catch (err) {
        setMsg({ tone: "destructive", text: getErrorMessage(err) });
      }
    });
    setWatched((w) => !w);
  }

  async function onAiScore() {
    setBusy(true);
    setMsg({ tone: "info", text: "Đang chấm điểm AI…" });
    try {
      await aiScoreMutation.mutateAsync();
      await refreshIssue();
      setMsg({ tone: "success", text: "Điểm AI đã sẵn sàng" });
    } catch (err) {
      setMsg({ tone: "destructive", text: getErrorMessage(err) });
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
    await withBusy(async () => {
      try {
        await aiDecisionMutation.mutateAsync({ decision, points });
        setMsg({ tone: "success", text: done });
        await refreshIssue();
      } catch (err) {
        setMsg({ tone: "destructive", text: getErrorMessage(err) });
      }
    });
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
      await commentMutation.mutateAsync({ body: text });
      setCommentDraft("");
      setMsg({ tone: "success", text: "Đã gửi bình luận lên Jira" });
      await refreshIssue();
    } catch (err) {
      setMsg({ tone: "destructive", text: getErrorMessage(err) });
    } finally {
      setCommenting(false);
    }
  }

  const stale = issue.staleSnapshots[0];
  const jiraUrl = getJiraIssueUrl(jiraBaseUrl, issue.jiraKey);
  const primaryBranch = branches?.items?.find((b) => b.linkState === "confirmed") || branches?.items?.[0];
  const primaryBranchUrl = primaryBranch
    ? getBitbucketBranchUrl(primaryBranch.repo, primaryBranch.branch, bitbucketBaseUrl, primaryBranch.prUrl)
    : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {jiraUrl ? (
              <a
                href={jiraUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                title="Mở xem trên Jira"
              >
                <span>{issue.jiraKey}</span>
                <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
              </a>
            ) : (
              <span className="font-mono text-sm text-muted-foreground">{issue.jiraKey}</span>
            )}
            <Badge>{issue.status}</Badge>
            {issue.points != null && <Badge variant="secondary">{issue.points} điểm</Badge>}
            {issue.timeSpentSeconds != null && issue.timeSpentSeconds > 0 && (
              <Badge variant="outline" className="gap-1 text-xs font-mono">
                <Clock className="h-3 w-3 text-teal-600 dark:text-teal-400" />
                {formatJiraDuration(issue.timeSpentSeconds)}
              </Badge>
            )}
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
          {jiraUrl && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 cursor-pointer text-xs font-semibold"
              title="Mở xem trên Jira"
            >
              <a href={jiraUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span>Xem trên Jira</span>
              </a>
            </Button>
          )}
          {primaryBranchUrl && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 cursor-pointer text-xs font-semibold border-teal-500/30 text-teal-600 dark:text-teal-400 bg-teal-500/5 hover:bg-teal-500/10"
              title={`Mở nhánh ${primaryBranch?.branch} trên Git`}
            >
              <a href={primaryBranchUrl} target="_blank" rel="noreferrer">
                <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="max-w-[130px] truncate">{primaryBranch?.branch}</span>
                <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
              </a>
            </Button>
          )}
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

        {/* Log Work Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setWorklogError(null);
            setLogWorkOpen(true);
          }}
          className="gap-1.5 text-xs cursor-pointer border-teal-500/30 text-teal-700 dark:text-teal-300 hover:bg-teal-500/10"
          title="Ghi thời gian làm việc (Worklog) lên Jira"
        >
          <Clock className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
          <span>Ghi thời gian</span>
          {issue.timeSpentSeconds != null && issue.timeSpentSeconds > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5 font-mono">
              {formatJiraDuration(issue.timeSpentSeconds)}
            </Badge>
          )}
        </Button>

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
        <FeedbackBanner tone={msg.tone === "success" ? "success" : msg.tone === "destructive" ? "destructive" : "info"}>
          {msg.text}
        </FeedbackBanner>
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
                {issue.timeSpentSeconds != null && issue.timeSpentSeconds > 0 && (
                  <div>
                    <span className="font-medium">Thời gian đã ghi:</span>{" "}
                    <span className="font-semibold text-foreground font-mono">
                      {formatJiraDuration(issue.timeSpentSeconds)}
                    </span>
                  </div>
                )}
                {issue.originalEstimateSeconds != null && issue.originalEstimateSeconds > 0 && (
                  <div>
                    <span className="font-medium">Estimate ban đầu:</span>{" "}
                    <span className="font-semibold text-foreground font-mono">
                      {formatJiraDuration(issue.originalEstimateSeconds)}
                    </span>
                  </div>
                )}
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
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => syncDevStatusMutation.mutate()}
                  disabled={syncDevStatusMutation.isPending}
                  title="Đồng bộ các nhánh và Pull Request trực tiếp từ Jira Development Panel"
                >
                  <RefreshCw className={cn("h-3 w-3", syncDevStatusMutation.isPending && "animate-spin")} />
                  {syncDevStatusMutation.isPending ? "Đang đồng bộ..." : "Đồng bộ Jira"}
                </Button>
                <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
                  <Link href={`/branches?q=${encodeURIComponent(issue.jiraKey)}`}>
                    Xem trong mục Nhánh →
                  </Link>
                </Button>
              </div>
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
                      {branches.items.map((b, i) => {
                        const branchUrl = getBitbucketBranchUrl(b.repo, b.branch, bitbucketBaseUrl, b.prUrl);
                        return (
                          <tr key={i} className="last:border-0 hover:bg-muted/30">
                            <td className="py-2 pl-1 font-mono text-xs font-semibold">
                              {branchUrl ? (
                                <a
                                  href={branchUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary hover:underline inline-flex items-center gap-1.5 cursor-pointer font-semibold"
                                  title={`Xem nhánh ${b.branch} trên Git`}
                                >
                                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                                  <span>{b.branch}</span>
                                  <ExternalLink className="h-3 w-3 opacity-60 shrink-0" aria-hidden="true" />
                                </a>
                              ) : (
                                <div className="flex items-center gap-1.5 text-foreground">
                                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                                  <span>{b.branch}</span>
                                </div>
                              )}
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
                                      className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                                      title="Mở Pull Request trên Git"
                                    >
                                      <span>#{b.prId}</span>
                                      <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
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
                        );
                      })}
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
                    Các nhánh Bitbucket chứa mã issue này sẽ tự động được liên kết, hoặc bạn có thể đồng bộ ngay từ Jira.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 text-xs gap-1.5"
                    onClick={() => syncDevStatusMutation.mutate()}
                    disabled={syncDevStatusMutation.isPending}
                  >
                    <RefreshCw className={cn("h-3 w-3", syncDevStatusMutation.isPending && "animate-spin")} />
                    {syncDevStatusMutation.isPending ? "Đang đồng bộ..." : "Đồng bộ từ Jira ngay"}
                  </Button>
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
                    {branches.suggestedItems.map((sb, idx) => {
                      const sbUrl = getBitbucketBranchUrl(sb.repo, sb.branch, bitbucketBaseUrl, sb.prUrl);
                      return (
                        <div key={idx} className="flex items-center justify-between py-2 gap-2">
                          <div className="flex flex-col gap-0.5 font-mono">
                            {sbUrl ? (
                              <a
                                href={sbUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                                title={`Xem nhánh ${sb.branch} trên Git`}
                              >
                                <span>{sb.branch}</span>
                                <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
                              </a>
                            ) : (
                              <span className="font-semibold text-foreground">{sb.branch}</span>
                            )}
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
                    );
                  })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Log Work Dialog */}
      <Dialog open={logWorkOpen} onOpenChange={setLogWorkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Ghi thời gian (Worklog)
            </DialogTitle>
            <DialogDescription>
              Ghi nhận thời gian thực tế đã làm cho task <span className="font-mono font-semibold text-foreground">{issue.jiraKey}</span> lên Jira.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2 text-sm">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Thời gian đã ghi trên task:</span>
                <span className="font-semibold font-mono">
                  {issue.timeSpentSeconds && issue.timeSpentSeconds > 0
                    ? formatJiraDuration(issue.timeSpentSeconds)
                    : "Chưa ghi nhận (0m)"}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground pt-1 border-t">
                * Không thay đổi Remaining Estimate (adjustEstimate = leave).
              </div>
            </div>

            {worklogError && (
              <FeedbackBanner tone="destructive" className="text-xs">
                {worklogError}
              </FeedbackBanner>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Thời lượng <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="Ví dụ: 30m, 2h, 1d 4h..."
                value={logTimeSpent}
                onChange={(e) => {
                  setLogTimeSpent(e.target.value);
                  setWorklogError(null);
                }}
                disabled={submittingWorklog}
                className="h-9 text-sm font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Cú pháp Jira: <strong>m</strong> (phút), <strong>h</strong> (giờ), <strong>d</strong> (ngày = 8h), <strong>w</strong> (tuần = 5d).
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Thời điểm bắt đầu <span className="text-destructive">*</span>
              </label>
              <Input
                type="datetime-local"
                value={logStartedAt}
                onChange={(e) => setLogStartedAt(e.target.value)}
                disabled={submittingWorklog}
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Theo giờ địa phương trình duyệt. Không chọn tương lai quá 5 phút.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Ghi chú (Tùy chọn)</span>
                <span className={cn("text-[11px]", logComment.length > 4000 ? "text-destructive font-semibold" : "text-muted-foreground")}>
                  {logComment.length} / 4000
                </span>
              </div>
              <Textarea
                rows={3}
                placeholder="Mô tả công việc đã làm..."
                value={logComment}
                onChange={(e) => setLogComment(e.target.value)}
                disabled={submittingWorklog}
                className="text-sm resize-y"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submittingWorklog}
              onClick={() => setLogWorkOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={submittingWorklog || !logTimeSpent.trim()}
              onClick={handleSubmitWorklog}
              className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
            >
              {submittingWorklog ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang ghi...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Ghi worklog
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
