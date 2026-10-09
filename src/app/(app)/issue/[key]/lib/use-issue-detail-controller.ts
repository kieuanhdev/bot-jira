"use client";

import { useState } from "react";
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
import { transitionsKeys, branchesForKeys, meKeys, issuesKeys } from "@/lib/query-keys";
import { safeRandomUUID } from "@/lib/utils";
import { isSafeReturnUrl } from "@/lib/worklogs/schema";
import type { IssueDetail, Transition, BranchRow, MsgState } from "./issue-detail-types";
import {
  getDefaultLogStartedAt,
  transitionTo,
  validateWorklog,
} from "./issue-detail-utils";
import {
  computeVersionsList,
  buildFieldUpdateMessage,
  buildAiDecisionMessage,
  applyWorklogToIssue,
} from "./issue-detail-model";

export function useIssueDetailController(initialIssue: IssueDetail) {
  const [issue, setIssue] = useState<IssueDetail>(initialIssue);
  const [watched, setWatched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<MsgState>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const actionParam = searchParams?.get("action");
  const returnToParam = searchParams?.get("returnTo");

  // Log Work dialog state
  const [logWorkOpen, setLogWorkOpen] = useState(() => actionParam === "log-work");
  const [prevActionParam, setPrevActionParam] = useState(actionParam);
  if (actionParam !== prevActionParam) {
    setPrevActionParam(actionParam);
    if (actionParam === "log-work") {
      setLogWorkOpen(true);
    }
  }
  const [logTimeSpent, setLogTimeSpent] = useState("");
  const [logStartedAt, setLogStartedAt] = useState(() => getDefaultLogStartedAt());
  const [logComment, setLogComment] = useState("");
  const [submittingWorklog, setSubmittingWorklog] = useState(false);
  const [worklogError, setWorklogError] = useState<string | null>(null);
  const [worklogIdempotencyKey, setWorklogIdempotencyKey] = useState(() => safeRandomUUID());

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
  const versionsList = computeVersionsList(issue.fixVersions, issue.releaseTasks);

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
    const validation = validateWorklog(logTimeSpent, logStartedAt);
    if (validation.error || !validation.parsedSeconds || !validation.startedDate) {
      setWorklogError(validation.error ?? "Thời lượng hoặc thời điểm không hợp lệ.");
      return;
    }

    setSubmittingWorklog(true);
    setWorklogError(null);

    try {
      const res = await worklogMutation.mutateAsync({
        timeSpent: logTimeSpent.trim(),
        startedAt: validation.startedDate.toISOString(),
        comment: logComment.trim() || undefined,
        adjustEstimate: "leave",
        idempotencyKey: worklogIdempotencyKey,
      });

      const addedSeconds = res.timeSpentSeconds ?? validation.parsedSeconds;
      setIssue((prev) => applyWorklogToIssue(prev, addedSeconds));

      const syncNote =
        res.cacheSynced === false ? " (Jira đã ghi nhận, dữ liệu tổng hợp đang chờ đồng bộ)" : "";
      setMsg({ tone: "success", text: `Đã ghi nhận ${logTimeSpent.trim()} lên Jira thành công!${syncNote}` });

      setLogWorkOpen(false);
      setLogTimeSpent("");
      setLogComment("");
      setWorklogIdempotencyKey(safeRandomUUID());

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
        setMsg({ tone: "success", text: successMsg ?? buildFieldUpdateMessage(patch) });
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
    await handleMutateField({ addFixVersion: ver }, `Đã thêm phiên bản ${ver}`);
  }

  async function handleRemoveVersion(ver: string) {
    await handleMutateField({ removeFixVersion: ver }, `Đã gỡ phiên bản ${ver}`);
  }

  async function handleAddLabel(l: string) {
    await handleMutateField({ addLabel: l }, `Đã thêm nhãn ${l}`);
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
    const msgText = buildAiDecisionMessage(decision, issue.aiScore.points, points);
    await withBusy(async () => {
      try {
        await aiDecisionMutation.mutateAsync({ decision, points });
        setMsg({ tone: "success", text: msgText });
        await refreshIssue();
      } catch (err) {
        setMsg({ tone: "destructive", text: getErrorMessage(err) });
      }
    });
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

  return {
    issue,
    watched,
    busy,
    msg,
    setMsg,
    commentDraft,
    setCommentDraft,
    commenting,
    creatingBranch,
    logWorkOpen,
    setLogWorkOpen,
    logTimeSpent,
    setLogTimeSpent,
    logStartedAt,
    setLogStartedAt,
    logComment,
    setLogComment,
    submittingWorklog,
    worklogError,
    setWorklogError,
    handleSubmitWorklog,
    transitions,
    me,
    projectKey,
    jiraBaseUrl,
    bitbucketBaseUrl,
    versionsList,
    filterOpts,
    projectVersions,
    branches,
    syncDevStatusMutation,
    handleConfirmBranch,
    handleRejectBranch,
    handleAssign,
    handleSetPoints,
    handleSetPriority,
    handleAddVersion,
    handleRemoveVersion,
    handleAddLabel,
    handleRemoveLabel,
    handleCreateBranch,
    onTransition,
    onToggleWatch,
    onAiScore,
    onAiDecision,
    onAddComment,
    returnToParam,
    router,
  };
}
