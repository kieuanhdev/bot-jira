"use client";

import { QuickPanelCloneDialog } from "./quick-panel-clone-dialog";
import { QuickPanelDeleteDialog } from "./quick-panel-delete-dialog";
import { LinkIssueDialog } from "@/components/issues/link-issue-dialog";
import { LogWorkDialog } from "@/components/issues/log-work-dialog";
import type { useQuickPanelClone } from "./hooks/use-quick-panel-clone";
import type { useQuickPanelDelete } from "./hooks/use-quick-panel-delete";
import type { useQuickPanelLink } from "./hooks/use-quick-panel-link";
import type { useQuickPanelWorklog } from "./hooks/use-quick-panel-worklog";

interface QuickPanelDialogsProps {
  jiraKey: string;
  summary: string;
  timeSpentSeconds: number | null;
  clone: ReturnType<typeof useQuickPanelClone>;
  del: ReturnType<typeof useQuickPanelDelete>;
  link: ReturnType<typeof useQuickPanelLink>;
  worklog: ReturnType<typeof useQuickPanelWorklog>;
}

export function QuickPanelDialogs({
  jiraKey,
  summary,
  timeSpentSeconds,
  clone,
  del,
  link,
  worklog,
}: QuickPanelDialogsProps) {
  return (
    <>
      {clone.cloneOpen && (
        <QuickPanelCloneDialog
          jiraKey={jiraKey}
          summary={summary}
          open={clone.cloneOpen}
          cloning={clone.cloning}
          error={clone.cloneError}
          onOpenChange={clone.setCloneOpen}
          onConfirm={clone.handleClone}
        />
      )}

      {del.deleteOpen && (
        <QuickPanelDeleteDialog
          jiraKey={jiraKey}
          summary={summary}
          open={del.deleteOpen}
          deleting={del.deleting}
          error={del.deleteError}
          onOpenChange={del.setDeleteOpen}
          onConfirm={() => void del.handleDelete()}
        />
      )}

      {link.linkOpen && (
        <LinkIssueDialog
          jiraKey={jiraKey}
          open={link.linkOpen}
          linking={link.linking}
          error={link.linkError}
          onOpenChange={link.setLinkOpen}
          onConfirm={link.handleLinkIssue}
        />
      )}

      {worklog.logWorkOpen && (
        <LogWorkDialog
          open={worklog.logWorkOpen}
          onOpenChange={(next) => !worklog.submittingWorklog && worklog.setLogWorkOpen(next)}
          jiraKey={jiraKey}
          timeSpentSeconds={timeSpentSeconds}
          logTimeSpent={worklog.logTimeSpent}
          onLogTimeSpentChange={worklog.setLogTimeSpent}
          logStartedAt={worklog.logStartedAt}
          onLogStartedAtChange={worklog.setLogStartedAt}
          logComment={worklog.logComment}
          onLogCommentChange={worklog.setLogComment}
          submitting={worklog.submittingWorklog}
          worklogError={worklog.worklogError}
          onSubmit={() => void worklog.handleSubmitWorklog()}
        />
      )}
    </>
  );
}
