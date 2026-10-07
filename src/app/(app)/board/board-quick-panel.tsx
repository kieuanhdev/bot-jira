"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { getJiraIssueUrl } from "@/lib/utils";
import { issuesKeys, meKeys, transitionsKeys, branchesForKeys } from "@/lib/query-keys";
import type { IssueItem } from "@/hooks/use-issues";
import type { QuickAction, QuickPanelDetail } from "./lib/board-types";
import { CATEGORY_DOT_MAP } from "./lib/board-types";
import { toName, statusCatOf } from "./lib/quick-panel-utils";
import { QuickPanelHeader } from "./quick-panel/quick-panel-header";
import { QuickPanelActions } from "./quick-panel/quick-panel-actions";
import { QuickPanelFields } from "./quick-panel/quick-panel-fields";
import { QuickPanelComments } from "./quick-panel/quick-panel-comments";
import { QuickPanelFooter } from "./quick-panel/quick-panel-footer";

export function QuickPanel({
  issue,
  jiraBaseUrl,
  assignees,
  onClose,
}: {
  issue: IssueItem;
  jiraBaseUrl: string;
  assignees: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [watched, setWatched] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [branchMsg, setBranchMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const { data: me } = useQuery({
    queryKey: meKeys.status,
    queryFn: () => api<{ jiraName: string | null; jiraBaseUrl?: string; bitbucketBaseUrl?: string }>("/api/me/status"),
    staleTime: 60_000,
  });

  const { data: detail } = useQuery({
    queryKey: issuesKeys.detail(issue.jiraKey),
    queryFn: () => api<{ issue: QuickPanelDetail }>(`/api/issues/${issue.jiraKey}`),
    staleTime: 15_000,
    retry: 1,
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

  const { data: projectVersions } = useQuery({
    queryKey: issuesKeys.versions(issue.jiraKey),
    queryFn: () => api<{ items: { id: string; name: string }[] }>(`/api/issues/${issue.jiraKey}/versions`),
    staleTime: 60_000,
  });

  const d = detail?.issue;
  const summary = d?.summary || issue.summary || "(no summary)";
  const status = d?.status ?? issue.status;
  const statusCat = issue.statusCategory;
  const priority = d?.priority ?? issue.priority;
  const assigneeJira = d?.assigneeJira ?? issue.assigneeJira;
  const points = d?.points ?? issue.points;
  const type = d?.type ?? issue.type ?? "—";
  const updatedAt = d?.updatedAt ?? issue.updatedAt;
  const createdAt = d?.createdAt ?? issue.createdAt;
  const lastSyncedAt = d?.lastSyncedAt ?? issue.lastSyncedAt;
  const aiScore = d?.aiScore ?? issue.aiScore;
  const aiDecision = d?.aiDecision ?? issue.aiDecision;
  const description = d?.description ?? issue.description;
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
    try {
      await api(`/api/issues/${issue.jiraKey}`, { method: "PATCH", body: patch });
      await invalidate();
    } catch {
      // ignore
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

  async function doAction(action: QuickAction) {
    const key = issue.jiraKey;
    try {
      if (action.kind === "openJira") {
        const base = jiraBaseUrl.replace(/\/$/, "");
        if (base) window.open(`${base}/browse/${key}`, "_blank", "noopener");
        return;
      }
      if (action.kind === "openFull") {
        router.push(`/issue/${key}`);
        return;
      }
      if (action.kind === "copyKey") {
        await navigator.clipboard.writeText(key);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
        return;
      }
      if (action.kind === "assignee") {
        await api(`/api/issues/${key}`, { method: "PATCH", body: { assignee: action.value } });
      } else if (action.kind === "priority") {
        await api(`/api/issues/${key}`, { method: "PATCH", body: { priority: action.value } });
      } else {
        const done = (transitions?.transitions ?? []).find(
          (t) => toName(t) && statusCatOf(t, issue)
        );
        if (done) await api(`/api/issues/${key}/transition`, { method: "POST", body: { transitionId: done.id } });
      }
      await invalidate();
    } catch {
      // Swallow; the board refetches on its own poll.
    }
  }

  async function toggleWatch() {
    try {
      await api(`/api/issues/${issue.jiraKey}/watch`, { method: "POST", body: {} });
      setWatched(true);
    } catch {
      // Ignore.
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
        className="flex h-full w-full max-w-md flex-col overflow-hidden border-l bg-card shadow-2xl outline-none motion-safe:animate-[panelIn_180ms_ease-out]"
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
          onCopyKey={() => {
            navigator.clipboard.writeText(issue.jiraKey).catch(() => {});
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
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
        />

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

          <QuickPanelComments
            description={description}
            comments={d?.comments}
            onAddComment={addComment}
          />
        </div>

        <QuickPanelFooter
          watched={watched}
          onToggleWatch={() => (watched ? setWatched(false) : void toggleWatch())}
          jiraUrl={jiraUrl}
          assignees={assignees}
          assigneeJira={assigneeJira}
          priority={priority}
          transitions={transitionList}
          onAction={doAction}
          onTransition={handleTransition}
          onOpenFull={() => router.push(`/issue/${issue.jiraKey}`)}
        />
      </div>
    </div>,
    document.body
  );
}
