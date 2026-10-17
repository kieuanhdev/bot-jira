"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { IssueItem } from "@/hooks/use-issues";
import { CATEGORY_DOT_MAP } from "./lib/board-types";
import { FLAG_LABEL } from "./lib/quick-panel-utils";
import { QuickPanelHeader } from "./quick-panel/quick-panel-header";
import { QuickPanelActions, type QuickPanelActionMessage } from "./quick-panel/quick-panel-actions";
import { QuickPanelDialogs } from "./quick-panel/quick-panel-dialogs";
import { QuickPanelFields } from "./quick-panel/quick-panel-fields";
import { QuickPanelComments } from "./quick-panel/quick-panel-comments";
import { QuickPanelFooter } from "./quick-panel/quick-panel-footer";
import { IssueRelations } from "@/components/issues/issue-relations";
import { useFlashMessage } from "@/hooks/use-flash-message";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useQuickPanelQueries } from "./quick-panel/hooks/use-quick-panel-queries";
import { useQuickPanelBranch } from "./quick-panel/hooks/use-quick-panel-branch";
import { useQuickPanelWorklog } from "./quick-panel/hooks/use-quick-panel-worklog";
import { useQuickPanelClone } from "./quick-panel/hooks/use-quick-panel-clone";
import { useQuickPanelDelete } from "./quick-panel/hooks/use-quick-panel-delete";
import { useQuickPanelLink } from "./quick-panel/hooks/use-quick-panel-link";
import { useQuickPanelFieldMutation } from "./quick-panel/hooks/use-quick-panel-field-mutation";

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
  const panelRef = useRef<HTMLDivElement | null>(null);

  const { message: copied, show: setCopied } = useFlashMessage<boolean>(1500);
  const { message: actionMsg, show: flashActionMsg } = useFlashMessage<QuickPanelActionMessage>(6000);

  useFocusTrap(panelRef, { onEscape: onClose });

  const {
    me,
    detail,
    cachedDetail,
    detailLoading,
    transitions,
    branchesData,
    refetchBranches,
    bitbucketBaseUrl,
    jiraUrl,
    projectVersions,
    commentsDisabled,
    watched,
    toggleWatch,
  } = useQuickPanelQueries(issue, jiraBaseUrl);

  const { creatingBranch, branchMsg, handleCreateBranch } = useQuickPanelBranch(issue.jiraKey);

  const d = detail?.issue ?? cachedDetail?.issue;
  const labels = d?.labels ?? issue.labels ?? [];
  const flagged = labels.includes(FLAG_LABEL);

  const mutation = useQuickPanelFieldMutation({
    issue,
    qc,
    onOptimisticUpdate,
    flagged,
    onError: (text) => flashActionMsg({ type: "error", text }),
  });
  const { optimisticOverrides, mutateField, handleTransition, toggleFlag, addComment, invalidate } = mutation;

  const clone = useQuickPanelClone({
    jiraKey: issue.jiraKey,
    invalidate,
    onResetActionMsg: () => flashActionMsg(null),
  });

  const del = useQuickPanelDelete({
    jiraKey: issue.jiraKey,
    invalidate,
    onClose,
  });

  const link = useQuickPanelLink({
    jiraKey: issue.jiraKey,
    invalidate,
    onSuccess: flashActionMsg,
    onResetActionMsg: () => flashActionMsg(null),
  });

  const worklog = useQuickPanelWorklog({
    jiraKey: issue.jiraKey,
    onSuccess: (text) => flashActionMsg({ type: "success", text }),
    invalidate,
  });

  function copyKey() {
    navigator.clipboard.writeText(issue.jiraKey).catch(() => {});
    setCopied(true);
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
  const pick = (field: string, fallback: string | null | undefined) =>
    optimisticOverrides[field] !== undefined ? (optimisticOverrides[field] as string | null) : fallback;
  const reporterJira = pick("reporter", d?.reporterJira ?? issue.reporterJira);
  const approverJira = pick("approver", d?.approverJira ?? issue.approverJira);
  const testerJira = pick("tester", d?.testerJira ?? issue.testerJira);
  const timeSpentSeconds = d?.timeSpentSeconds ?? issue.timeSpent;
  const stale = d?.staleSnapshots?.[0] ?? null;

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
          copied={Boolean(copied)}
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
          onCreateBranch={() => void handleCreateBranch(refetchBranches)}
          branchMsg={branchMsg}
          cloning={clone.cloning}
          onClone={clone.openCloneDialog}
          cloneMsg={clone.cloneMsg}
          actionMsg={actionMsg}
        />

        <QuickPanelDialogs
          jiraKey={issue.jiraKey}
          summary={summary}
          timeSpentSeconds={timeSpentSeconds}
          clone={clone}
          del={del}
          link={link}
          worklog={worklog}
        />

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <QuickPanelFields
            summary={summary}
            onSetSummary={(value) => mutateField({ summary: value })}
            status={status}
            dotClass={dotClass}
            transitions={transitionList}
            onTransition={handleTransition}
            priority={priority}
            onSetPriority={(p) => mutateField({ priority: p })}
            assigneeJira={assigneeJira}
            reporterJira={reporterJira}
            approverJira={approverJira}
            testerJira={testerJira}
            onSetPerson={(role, name) => mutateField({ [role]: name })}
            dueDate={dueDate}
            onSetDueDate={(value) => mutateField({ dueDate: value })}
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
            labels={labels}
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
            jiraKey={issue.jiraKey}
            description={description}
            onSaveDescription={(value) => mutateField({ description: value })}
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
          onLogWork={worklog.openLogWorkDialog}
          onLinkIssue={link.openLinkDialog}
          onDelete={del.openDeleteDialog}
          onCopyLink={() => void copyToClipboard(jiraUrl ?? "", "Đã sao chép liên kết Jira.")}
          onOpenFull={() => router.push(`/issue/${issue.jiraKey}`)}
        />
      </div>
    </div>,
    document.body
  );
}
