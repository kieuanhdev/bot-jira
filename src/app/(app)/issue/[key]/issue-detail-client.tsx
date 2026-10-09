"use client";

import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { formatDateTime, timeAgo, getJiraIssueUrl, getBitbucketBranchUrl } from "@/lib/utils";
import { wikiToHtml } from "@/lib/wiki";
import { formatJiraDuration } from "@/lib/worklogs/schema";
import { IssueDependencies } from "@/components/issue-dependencies";
import type { IssueDetail } from "./lib/issue-detail-types";
import { IssueDetailHeader } from "./issue-detail-header";
import { IssueDetailActions } from "./issue-detail-actions";
import { IssueDetailVersionsLabels } from "./issue-detail-versions-labels";
import { IssueDetailTabsAi } from "./issue-detail-tabs-ai";
import { IssueDetailTabsBranches } from "./issue-detail-tabs-branches";
import { IssueDetailTabsComments } from "./issue-detail-tabs-comments";
import { IssueDetailLogWorkDialog } from "./issue-detail-log-work-dialog";
import { useIssueDetailController } from "./lib/use-issue-detail-controller";

export function IssueDetailClient({ issue: initial }: { issue: IssueDetail }) {
  const {
    issue,
    watched,
    busy,
    msg,
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
  } = useIssueDetailController(initial);

  const jiraUrl = getJiraIssueUrl(jiraBaseUrl, issue.jiraKey);
  const primaryBranch = branches?.items?.find((b) => b.linkState === "confirmed") || branches?.items?.[0];
  const primaryBranchUrl = primaryBranch
    ? getBitbucketBranchUrl(primaryBranch.repo, primaryBranch.branch, bitbucketBaseUrl, primaryBranch.prUrl)
    : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <IssueDetailHeader
        issue={issue}
        jiraUrl={jiraUrl}
        primaryBranch={primaryBranch}
        primaryBranchUrl={primaryBranchUrl}
        watched={watched}
        busy={busy}
        transitions={transitions?.transitions ?? []}
        onToggleWatch={onToggleWatch}
        onTransition={onTransition}
      />

      <IssueDetailActions
        assigneeJira={issue.assigneeJira}
        assignees={filterOpts?.assignees ?? []}
        meName={me?.jiraName}
        onAssign={handleAssign}
        priority={issue.priority}
        onSetPriority={handleSetPriority}
        points={issue.points}
        onSetPoints={handleSetPoints}
        timeSpentSeconds={issue.timeSpentSeconds}
        onOpenLogWork={() => {
          setWorklogError(null);
          setLogWorkOpen(true);
        }}
        creatingBranch={creatingBranch}
        onCreateBranch={handleCreateBranch}
      />

      <IssueDetailVersionsLabels
        fixVersions={versionsList}
        projectVersions={projectVersions?.items ?? []}
        onAddVersion={handleAddVersion}
        onRemoveVersion={handleRemoveVersion}
        labels={issue.labels ?? []}
        onAddLabel={handleAddLabel}
        onRemoveLabel={handleRemoveLabel}
      />

      {msg && (
        <FeedbackBanner tone={msg.tone === "success" ? "success" : msg.tone === "destructive" ? "destructive" : "info"}>
          {msg.text}
        </FeedbackBanner>
      )}

      <Tabs defaultValue="detail">
        <TabsList>
          <TabsTrigger value="detail">Chi tiết</TabsTrigger>
          <TabsTrigger value="dependencies">Phụ thuộc</TabsTrigger>
          <TabsTrigger value="comments">Bình luận ({(issue.comments ?? []).length})</TabsTrigger>
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
            rootProjectKey={projectKey}
            rootFixVersionNames={versionsList}
          />
        </TabsContent>

        <TabsContent value="dependencies">
          <IssueDependencies
            jiraKey={issue.jiraKey}
            rootProjectKey={projectKey}
            rootFixVersionNames={versionsList}
          />
        </TabsContent>

        <TabsContent value="comments">
          <IssueDetailTabsComments
            comments={issue.comments}
            commentDraft={commentDraft}
            onCommentDraftChange={setCommentDraft}
            commenting={commenting}
            onAddComment={onAddComment}
          />
        </TabsContent>

        <TabsContent value="ai">
          <IssueDetailTabsAi
            aiScore={issue.aiScore}
            aiDecision={issue.aiDecision}
            busy={busy}
            onAiScore={onAiScore}
            onAiDecision={onAiDecision}
            currentPoints={issue.points}
          />
        </TabsContent>

        <TabsContent value="branches">
          <IssueDetailTabsBranches
            jiraKey={issue.jiraKey}
            branches={branches}
            bitbucketBaseUrl={bitbucketBaseUrl}
            syncPending={syncDevStatusMutation.isPending}
            onSync={() => syncDevStatusMutation.mutate()}
            onConfirmBranch={handleConfirmBranch}
            onRejectBranch={handleRejectBranch}
          />
        </TabsContent>
      </Tabs>

      <IssueDetailLogWorkDialog
        open={logWorkOpen}
        onOpenChange={setLogWorkOpen}
        jiraKey={issue.jiraKey}
        timeSpentSeconds={issue.timeSpentSeconds}
        logTimeSpent={logTimeSpent}
        onLogTimeSpentChange={(val) => {
          setLogTimeSpent(val);
          setWorklogError(null);
        }}
        logStartedAt={logStartedAt}
        onLogStartedAtChange={setLogStartedAt}
        logComment={logComment}
        onLogCommentChange={setLogComment}
        submitting={submittingWorklog}
        worklogError={worklogError}
        onSubmit={handleSubmitWorklog}
      />
    </div>
  );
}
