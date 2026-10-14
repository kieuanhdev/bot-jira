"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getErrorMessage } from "@/lib/api-client";
import { getJiraIssueUrl, safeRandomUUID } from "@/lib/utils";
import {
  issuesKeys,
  meKeys,
  transitionsKeys,
  branchesForKeys,
  watchKeys,
  boardKeys,
} from "@/lib/query-keys";
import { getDefaultLogStartedAt, validateWorklog } from "@/lib/worklogs/schema";
import type { IssueItem } from "@/hooks/use-issues";
import { useIssueWorklog } from "@/hooks/use-issue-detail";
import { CATEGORY_DOT_MAP } from "./lib/board-types";
import { FLAG_LABEL } from "./lib/quick-panel-utils";
import { QuickPanelHeader } from "./quick-panel/quick-panel-header";
import { QuickPanelActions, type QuickPanelActionMessage } from "./quick-panel/quick-panel-actions";
import { QuickPanelDeleteDialog } from "./quick-panel/quick-panel-delete-dialog";
import { QuickPanelCloneDialog } from "./quick-panel/quick-panel-clone-dialog";
import { QuickPanelLinkDialog } from "./quick-panel/quick-panel-link-dialog";
import { LogWorkDialog } from "@/components/issues/log-work-dialog";
import { QuickPanelFields } from "./quick-panel/quick-panel-fields";
import { QuickPanelComments } from "./quick-panel/quick-panel-comments";
import { QuickPanelFooter } from "./quick-panel/quick-panel-footer";
import { IssueRelations } from "@/components/issues/issue-relations";
import { issueCachedDetailQuery, issueDetailQuery } from "./lib/issue-detail-queries";
import { applyOptimisticIssuePatch } from "./lib/board-optimistic";

export function QuickPanel({
  issue,
  jiraBaseUrl,
  assignees,
  onClose,
  onOptimisticUpdate,
}: {
  issue: IssueItem;
  jiraBaseUrl: string;
  assignees: string[];
  onClose: () => void;
  onOptimisticUpdate?: (patch: Partial<IssueItem> & { jiraKey: string }) => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [branchMsg, setBranchMsg] = useState<QuickPanelActionMessage | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneMsg, setCloneMsg] = useState<QuickPanelActionMessage | null>(null);
  const [actionMsg, setActionMsg] = useState<QuickPanelActionMessage | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [logWorkOpen, setLogWorkOpen] = useState(false);
  const [logTimeSpent, setLogTimeSpent] = useState("");
  const [logStartedAt, setLogStartedAt] = useState(() => getDefaultLogStartedAt());
  const [logComment, setLogComment] = useState("");
  const [submittingWorklog, setSubmittingWorklog] = useState(false);
  const [worklogError, setWorklogError] = useState<string | null>(null);
  const [worklogIdempotencyKey, setWorklogIdempotencyKey] = useState(() => safeRandomUUID());
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, unknown>>({});
  const panelRef = useRef<HTMLDivElement | null>(null);

  const { data: me } = useQuery({
    queryKey: meKeys.status,
    queryFn: () => api<{ jiraName: string | null; jiraBaseUrl?: string; bitbucketBaseUrl?: string }>("/api/me/status"),
    staleTime: 60_000,
  });

  const { data: detail, isPending: detailLoading } = useQuery({
    ...issueDetailQuery(issue.jiraKey),
    retry: 1,
  });

  // Instant DB snapshot so the panel fills in while the live Jira read is in flight.
  const { data: cachedDetail } = useQuery({
    ...issueCachedDetailQuery(issue.jiraKey),
    retry: 0,
  });

  const { data: transitions } = useQuery({
    queryKey: transitionsKeys.forIssue(issue.jiraKey),
    queryFn: () =>
      api<{ transitions: { id: string; to?: { name?: string } | string }[] }>(
        `/api/issues/${issue.jiraKey}/transitions`
      ),
    retry: 1,
  });

  const { data: branchesData, refetch: refetchBranches } = useQuery({
    queryKey: branchesForKeys.forIssue(issue.jiraKey),
    queryFn: () =>
      api<{ items: { repo: string; branch: string; prUrl?: string | null }[]; bitbucketBaseUrl?: string | null }>(
        `/api/issues/${issue.jiraKey}/branches`
      ),
    staleTime: 15_000,
  });

  const bitbucketBaseUrl = branchesData?.bitbucketBaseUrl || me?.bitbucketBaseUrl || "";
  const jiraUrl = getJiraIssueUrl(jiraBaseUrl || me?.jiraBaseUrl, issue.jiraKey);

  // The watch endpoint is a server-side toggle, so the panel reads the current
  // state instead of assuming "not watching" on open.
  const { data: watchList } = useQuery({
    queryKey: watchKeys.all,
    queryFn: () => api<{ items: { jiraKey: string }[] }>("/api/watch"),
    staleTime: 30_000,
    retry: 1,
  });
  const [watchOverride, setWatchOverride] = useState<boolean | null>(null);
  const watched =
    watchOverride ?? (watchList?.items ?? []).some((w) => w.jiraKey === issue.jiraKey);

  const worklogMutation = useIssueWorklog(issue.jiraKey);

  const { data: projectVersions } = useQuery({
    queryKey: issuesKeys.versions(issue.jiraKey),
    queryFn: () => api<{ items: { id: string; name: string }[] }>(`/api/issues/${issue.jiraKey}/versions`),
    staleTime: 60_000,
  });

  const { data: projectsData } = useQuery({
    queryKey: boardKeys.projects,
    queryFn: () =>
      api<{
        items: Array<{
          key: string;
          features?: Record<string, boolean>;
          syncEnabled?: boolean;
        }>;
      }>("/api/projects"),
    staleTime: 60_000,
  });

  const issueProjectKey = (issue.projectKey || issue.jiraKey.split("-")[0]).toUpperCase();
  const currentProject = projectsData?.items?.find((p) => p.key === issueProjectKey);
  const commentsDisabled = currentProject?.features?.comments === false;

  const d = detail?.issue ?? cachedDetail?.issue;
  const summary = (optimisticOverrides.summary as string | undefined) ?? d?.summary ?? issue.summary ?? "(no summary)";
  const status = d?.status ?? issue.status;
  const statusCat = issue.statusCategory;
  const priority = (optimisticOverrides.priority as string | undefined) ?? d?.priority ?? issue.priority;
  const assigneeJira =
    optimisticOverrides.assignee !== undefined
      ? (optimisticOverrides.assignee as string | null)
      : (d?.assigneeJira ?? issue.assigneeJira);
  const points =
    optimisticOverrides.points !== undefined
      ? (optimisticOverrides.points as number | null)
      : (d?.points ?? issue.points);
  const type = d?.type ?? issue.type ?? "—";
  const updatedAt = d?.updatedAt ?? issue.updatedAt;
  const createdAt = d?.createdAt ?? issue.createdAt;
  const lastSyncedAt = d?.lastSyncedAt ?? issue.lastSyncedAt;
  const aiScore = d?.aiScore ?? issue.aiScore;
  const aiDecision = d?.aiDecision ?? issue.aiDecision;
  const description = (optimisticOverrides.description as string | undefined) ?? d?.description ?? issue.description;
  const dueDate =
    optimisticOverrides.dueDate !== undefined
      ? (optimisticOverrides.dueDate as string | null)
      : (d?.dueDate ?? issue.dueDate);
  const labels = d?.labels ?? issue.labels ?? [];
  const flagged = labels.includes(FLAG_LABEL);
  const timeSpentSeconds = d?.timeSpentSeconds ?? issue.timeSpent;
  const stale = d?.staleSnapshots?.[0] ?? null;

  // Auto-focus the panel on open; trap Tab inside; Escape closes.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    const node = panelRef.current;
    node?.addEventListener("keydown", onKey);
    return () => {
      node?.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: issuesKeys.all });
    qc.invalidateQueries({ queryKey: issuesKeys.detail(issue.jiraKey) });
  }

  async function mutateField(patch: Record<string, unknown>) {
    // 1. Instant optimistic update for the QuickPanel UI (0ms)
    setOptimisticOverrides((prev) => ({ ...prev, ...patch }));

    // 2. Instant optimistic update for TanStack Query caches (detail & board list)
    const rollback = applyOptimisticIssuePatch(qc, issue.jiraKey, patch, issue);

    // 3. Notify parent (board-client) to keep its local state in sync
    onOptimisticUpdate?.({
      jiraKey: issue.jiraKey,
      ...(patch.points !== undefined ? { points: patch.points as number | null } : {}),
      ...(patch.assignee !== undefined ? { assigneeJira: patch.assignee as string | null } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority as string } : {}),
    });

    try {
      await api(`/api/issues/${issue.jiraKey}`, { method: "PATCH", body: patch });
      // Invalidate in the background silently
      void invalidate();
    } catch {
      // Revert upon network or validation failure
      rollback();
      setOptimisticOverrides((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(patch)) delete next[k];
        return next;
      });
    }
  }

  async function handleTransition(transitionId: string) {
    try {
      await api(`/api/issues/${issue.jiraKey}/transition`, {
        method: "POST",
        body: { transitionId },
      });
      await invalidate();
    } catch {
      // ignore
    }
  }

  async function handleCreateBranch() {
    setCreatingBranch(true);
    setBranchMsg(null);
    try {
      const res = await api<{ ok: boolean; branch?: string; error?: string }>(
        `/api/issues/${issue.jiraKey}/branches`,
        { method: "POST", body: {} }
      );
      await refetchBranches();
      setBranchMsg({ type: "success", text: `Đã tạo nhánh: ${res.branch}` });
      setTimeout(() => setBranchMsg(null), 4000);
    } catch (e) {
      setBranchMsg({ type: "error", text: `Lỗi: ${(e as Error).message}` });
      setTimeout(() => setBranchMsg(null), 4000);
    } finally {
      setCreatingBranch(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/api/issues/${issue.jiraKey}`, { method: "DELETE" });
      setDeleteOpen(false);
      await invalidate();
      onClose();
    } catch (e) {
      setDeleteError(getErrorMessage(e, "Không xóa được task."));
    } finally {
      setDeleting(false);
    }
  }

  async function handleClone(cloneSummaryText: string) {
    setCloning(true);
    setCloneError(null);
    try {
      const res = await api<{
        key: string;
        relation?: string | null;
        linkError?: string | null;
      }>(`/api/issues/${issue.jiraKey}/clone`, {
        method: "POST",
        body: { summary: cloneSummaryText },
      });
      setCloneOpen(false);
      setCloneMsg({
        type: res.linkError ? "error" : "success",
        text: res.linkError
          ? `Đã tạo ${res.key} nhưng chưa liên kết được với ${issue.jiraKey}: ${res.linkError}`
          : `Đã clone thành ${res.key}${res.relation ? ` (${res.relation} ${issue.jiraKey})` : ""}.`,
        href: `/issue/${encodeURIComponent(res.key)}`,
        linkLabel: `Mở ${res.key}`,
      });
      await invalidate();
    } catch (e) {
      setCloneError(getErrorMessage(e, "Không clone được task."));
    } finally {
      setCloning(false);
    }
  }

  /** Show a short-lived note under the action bar, like the branch/clone ones. */
  function flashActionMsg(message: QuickPanelActionMessage) {
    setActionMsg(message);
    window.setTimeout(() => setActionMsg(null), 6000);
  }

  async function handleLinkIssue(input: {
    typeName: string;
    direction: "inward" | "outward";
    targetKey: string;
  }) {
    setLinking(true);
    setLinkError(null);
    try {
      await api(`/api/issues/${issue.jiraKey}/links`, { method: "POST", body: input });
      setLinkOpen(false);
      flashActionMsg({
        type: "success",
        text: `Đã liên kết ${issue.jiraKey} với ${input.targetKey}.`,
        href: `/issue/${encodeURIComponent(input.targetKey)}`,
        linkLabel: `Mở ${input.targetKey}`,
      });
      await invalidate();
    } catch (e) {
      setLinkError(getErrorMessage(e, "Không tạo được liên kết."));
    } finally {
      setLinking(false);
    }
  }

  async function handleSubmitWorklog() {
    const validation = validateWorklog(logTimeSpent, logStartedAt);
    if (validation.error || !validation.startedDate) {
      setWorklogError(validation.error ?? "Thời lượng hoặc thời điểm không hợp lệ.");
      return;
    }
    setSubmittingWorklog(true);
    setWorklogError(null);
    try {
      await worklogMutation.mutateAsync({
        timeSpent: logTimeSpent.trim(),
        startedAt: validation.startedDate.toISOString(),
        comment: logComment.trim() || undefined,
        adjustEstimate: "leave",
        idempotencyKey: worklogIdempotencyKey,
      });
      setLogWorkOpen(false);
      setLogTimeSpent("");
      setLogComment("");
      // A fresh key so the next worklog is not swallowed as a duplicate.
      setWorklogIdempotencyKey(safeRandomUUID());
      flashActionMsg({ type: "success", text: `Đã ghi ${logTimeSpent.trim()} lên Jira.` });
      await invalidate();
    } catch (e) {
      setWorklogError(getErrorMessage(e, "Có lỗi xảy ra khi ghi worklog lên Jira."));
    } finally {
      setSubmittingWorklog(false);
    }
  }

  /** Marks an impediment with the Impediment label (not Jira's Flagged field). */
  async function toggleFlag() {
    await mutateField(flagged ? { removeLabel: FLAG_LABEL } : { addLabel: FLAG_LABEL });
  }

  function openCloneDialog() {
    setCloneError(null);
    setCloneMsg(null);
    setActionMsg(null);
    setCloneOpen(true);
  }

  function copyKey() {
    navigator.clipboard.writeText(issue.jiraKey).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function copyToClipboard(text: string, message: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      flashActionMsg({ type: "success", text: message });
    } catch {
      flashActionMsg({ type: "error", text: "Trình duyệt không cho phép sao chép." });
    }
  }

  async function toggleWatch() {
    const next = !watched;
    setWatchOverride(next);
    try {
      const res = await api<{ watching: boolean }>(`/api/issues/${issue.jiraKey}/watch`, {
        method: "POST",
        body: {},
      });
      // The endpoint toggles server-side; its answer is the authority.
      setWatchOverride(res.watching);
      qc.invalidateQueries({ queryKey: watchKeys.all });
    } catch {
      setWatchOverride(!next);
    }
  }

  async function addComment(text: string) {
    await api(`/api/issues/${issue.jiraKey}/comments`, { method: "POST", body: { body: text } });
    await invalidate();
  }

  const dotClass = CATEGORY_DOT_MAP[statusCat] ?? "bg-slate-400";
  const transitionList = transitions?.transitions ?? [];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`${issue.jiraKey} quick panel`}
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex h-full w-full flex-col sm:w-1/2 sm:min-w-[32rem] overflow-hidden border-l bg-card shadow-2xl outline-none motion-safe:animate-[panelIn_180ms_ease-out]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <QuickPanelHeader
          jiraKey={issue.jiraKey}
          status={status}
          priority={priority}
          points={points}
          aiScore={aiScore}
          aiDecision={aiDecision}
          stale={stale}
          dotClass={dotClass}
          jiraUrl={jiraUrl}
          copied={copied}
          onCopyKey={copyKey}
          onClose={onClose}
        />

        <QuickPanelActions
          status={status}
          dotClass={dotClass}
          transitions={transitionList}
          onTransition={handleTransition}
          assigneeJira={assigneeJira}
          assignees={assignees}
          meName={me?.jiraName}
          onAssign={(a) => mutateField({ assignee: a })}
          points={points}
          onSetPoints={(p) => mutateField({ points: p })}
          priority={priority}
          onSetPriority={(p) => mutateField({ priority: p })}
          creatingBranch={creatingBranch}
          onCreateBranch={handleCreateBranch}
          branchMsg={branchMsg}
          cloning={cloning}
          onClone={openCloneDialog}
          cloneMsg={cloneMsg}
          actionMsg={actionMsg}
        />

        {cloneOpen && (
          <QuickPanelCloneDialog
            jiraKey={issue.jiraKey}
            summary={summary}
            open={cloneOpen}
            cloning={cloning}
            error={cloneError}
            onOpenChange={setCloneOpen}
            onConfirm={handleClone}
          />
        )}

        {deleteOpen && (
          <QuickPanelDeleteDialog
            jiraKey={issue.jiraKey}
            summary={summary}
            open={deleteOpen}
            deleting={deleting}
            error={deleteError}
            onOpenChange={setDeleteOpen}
            onConfirm={() => void handleDelete()}
          />
        )}

        {linkOpen && (
          <QuickPanelLinkDialog
            jiraKey={issue.jiraKey}
            open={linkOpen}
            linking={linking}
            error={linkError}
            onOpenChange={setLinkOpen}
            onConfirm={handleLinkIssue}
          />
        )}

        {logWorkOpen && (
          <LogWorkDialog
            open={logWorkOpen}
            onOpenChange={(next) => !submittingWorklog && setLogWorkOpen(next)}
            jiraKey={issue.jiraKey}
            timeSpentSeconds={timeSpentSeconds}
            logTimeSpent={logTimeSpent}
            onLogTimeSpentChange={setLogTimeSpent}
            logStartedAt={logStartedAt}
            onLogStartedAtChange={setLogStartedAt}
            logComment={logComment}
            onLogCommentChange={setLogComment}
            submitting={submittingWorklog}
            worklogError={worklogError}
            onSubmit={() => void handleSubmitWorklog()}
          />
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <QuickPanelFields
            summary={summary}
            status={status}
            dotClass={dotClass}
            transitions={transitionList}
            onTransition={handleTransition}
            priority={priority}
            onSetPriority={(p) => mutateField({ priority: p })}
            assigneeJira={assigneeJira}
            reporterJira={d?.reporterJira ?? issue.reporterJira}
            approverJira={d?.approverJira ?? issue.approverJira}
            testerJira={d?.testerJira ?? issue.testerJira}
            dueDate={d?.dueDate ?? issue.dueDate}
            timeSpentSeconds={d?.timeSpentSeconds ?? issue.timeSpent}
            originalEstimateSeconds={d?.originalEstimateSeconds ?? issue.originalEstimateSeconds}
            assignees={assignees}
            meName={me?.jiraName}
            onAssign={(a) => mutateField({ assignee: a })}
            points={points}
            onSetPoints={(p) => mutateField({ points: p })}
            type={type}
            updatedAt={updatedAt}
            createdAt={createdAt}
            lastSyncedAt={lastSyncedAt}
            fixVersions={d?.fixVersions ?? issue.fixVersionNames ?? []}
            projectVersions={projectVersions?.items ?? []}
            onAddVersion={(val) => mutateField({ addFixVersion: val })}
            onRemoveVersion={(val) => mutateField({ removeFixVersion: val })}
            labels={d?.labels ?? issue.labels ?? []}
            onAddLabel={(val) => mutateField({ addLabel: val })}
            onRemoveLabel={(val) => mutateField({ removeLabel: val })}
            branches={branchesData?.items ?? []}
            bitbucketBaseUrl={bitbucketBaseUrl}
          />

          <IssueRelations
            relationships={d?.relationships}
            loading={detailLoading}
            className="mt-4 border-t pt-4"
          />

          <QuickPanelComments
            description={description}
            comments={d?.comments}
            onAddComment={addComment}
            commentsDisabled={commentsDisabled}
          />
        </div>

        <QuickPanelFooter
          jiraKey={issue.jiraKey}
          watched={watched}
          onToggleWatch={() => void toggleWatch()}
          jiraUrl={jiraUrl}
          dueDate={dueDate}
          onSetDueDate={(value) => mutateField({ dueDate: value })}
          flagged={flagged}
          onToggleFlag={() => void toggleFlag()}
          onLogWork={() => {
            setWorklogError(null);
            setLogStartedAt(getDefaultLogStartedAt());
            setLogWorkOpen(true);
          }}
          onLinkIssue={() => {
            setLinkError(null);
            setActionMsg(null);
            setLinkOpen(true);
          }}
          onDelete={() => {
            setDeleteError(null);
            setDeleteOpen(true);
          }}
          onCopyLink={() => void copyToClipboard(jiraUrl ?? "", "Đã sao chép liên kết Jira.")}
          onOpenFull={() => router.push(`/issue/${issue.jiraKey}`)}
        />
      </div>
    </div>,
    document.body
  );
}
