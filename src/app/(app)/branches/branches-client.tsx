"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton } from "@/components/shared/skeleton";
import { RefreshCw, AlertCircle, ChevronLeft, ChevronRight, Inbox, GitBranch } from "lucide-react";

import { getErrorMessage } from "@/lib/api-client";
import {
  type ReviewSuggestionItem,
  type UnlinkedBranchItem,
  type BranchRowItem,
} from "./branch-types";
import { BranchToolbar } from "./branch-toolbar";
import { TaskDeliveryList } from "./task-delivery-list";
import { ReviewInboxView } from "./review-inbox-view";
import { UnlinkedBranchView } from "./unlinked-branch-view";
import { BranchTable } from "./branch-table";
import { BranchCardList } from "./branch-card-list";
import { BranchDetailSheet } from "./branch-detail-sheet";
import { BranchLinkDialog } from "./branch-link-dialog";
import { TaskBranchLinkDialog } from "./task-branch-link-dialog";
import { TaskPrCreateDialog } from "./task-pr-create-dialog";
import { BranchEmptyState } from "./branch-empty-state";
import { useBranchesController } from "./lib/use-branches-controller";

export function BranchesClient() {
  const {
    toast,
    showToast,
    filters,
    updateFilters,
    resetFilters,
    isTechnicalView,
    isLoading,
    isError,
    error,
    refetch,
    freshness,
    projectOptions,
    repoOptions,
    bitbucketBaseUrl,
    jiraBaseUrl,
    syncMutation,
    branchQueryResult,
    taskQueryResult,
    selectedBranchForDrawer,
    setSelectedBranchForDrawer,
    selectedBranchForLink,
    setSelectedBranchForLink,
    attachTask,
    setAttachTask,
    prTask,
    setPrTask,
    bulkLinkIds,
    setBulkLinkIds,
    toBranchRow,
    handleSyncNow,
    handleConfirmSuggestion,
    handleConfirmAll,
    handleRejectSuggestion,
    handleUnlinkBranch,
  } = useBranchesController();

  const activePage = isTechnicalView
    ? branchQueryResult.data?.page
    : taskQueryResult.data?.page;

  const counts = taskQueryResult.data?.counts;

  return (
    <PageContainer size="wide">
    <div className="relative flex flex-col gap-5 pb-10">
      {/* Toast Feedback */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-popover px-4 py-2.5 text-xs font-semibold text-foreground shadow-lg"
        >
          {toast}
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title="Workspace Nhánh & Delivery"
        meta={freshness?.lastSuccessAt ? `• Đã đồng bộ ${timeAgo(freshness.lastSuccessAt)}` : undefined}
        description="Theo dõi tiến độ phân phối phần mềm theo Jira Task, quản lý nhánh Bitbucket và duyệt gợi ý liên kết."
        actions={
          <>
            {freshness?.stale && (
              <Badge variant="warning" className="gap-1 text-xs">
                <AlertCircle className="h-3.5 w-3.5" /> Dữ liệu đồng bộ có thể đã cũ
              </Badge>
            )}

            <Button
              variant="outline"
              size="sm"
              disabled={syncMutation.isPending}
              onClick={handleSyncNow}
              className="h-8 gap-1.5 text-xs text-foreground cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin text-primary" : ""}`} />
              {syncMutation.isPending ? "Đang đồng bộ..." : "Đồng bộ Bitbucket"}
            </Button>
          </>
        }
      />

      {/* Toolbar with Navigation Tabs & Filters */}
      <BranchToolbar
        filters={filters}
        onFilterChange={updateFilters}
        onResetFilters={resetFilters}
        totalResults={activePage?.totalItems}
        projectOptions={projectOptions}
        repoOptions={repoOptions}
        counts={counts}
      />

      {/* Loading Skeleton */}
      {isLoading && !activePage && <ListSkeleton rows={6} />}

      {/* Error state */}
      {isError && (
        <ErrorState
          title="Không thể tải dữ liệu workspace"
          message={getErrorMessage(error)}
          onRetry={refetch}
          retryLabel="Thử lại"
        />
      )}

      {/* View Content Rendering */}
      {!isLoading && !isError && (
        <>
          {/* 1 & 2: Task-centric views (my-work, needs-attention) */}
          {(filters.view === "my-work" || filters.view === "needs-attention") && (
            <>
              {filters.view === "my-work" && taskQueryResult.data?.jiraNotConfigured ? (
                <EmptyState
                  icon={GitBranch}
                  title="Chưa liên kết tài khoản Jira"
                  hint="Bạn chưa cấu hình thông tin Jira cá nhân. Vui lòng vào Cài đặt để kết nối tài khoản và xem các nhánh/công việc được giao cho bạn."
                  action={
                    <Link href="/settings">
                      <Button variant="outline" size="sm" className="text-xs">
                        Đi đến Cài đặt tích hợp
                      </Button>
                    </Link>
                  }
                />
              ) : taskQueryResult.data?.tasks && taskQueryResult.data.tasks.length > 0 ? (
                <TaskDeliveryList
                  tasks={taskQueryResult.data.tasks}
                  bitbucketBaseUrl={bitbucketBaseUrl}
                  jiraBaseUrl={jiraBaseUrl}
                  onAttachBranch={(task) => setAttachTask({ jiraKey: task.jiraKey, summary: task.summary })}
                  onCreatePrs={(task) => setPrTask({ jiraKey: task.jiraKey, summary: task.summary })}
                />
              ) : (
                <BranchEmptyState
                  hasFilters={filters.q !== "" || filters.project !== "ALL"}
                  onResetFilters={resetFilters}
                />
              )}
            </>
          )}

          {/* 3: Pending review inbox */}
          {filters.view === "pending-review" && (
            <>
              {taskQueryResult.data?.reviewItems && taskQueryResult.data.reviewItems.length > 0 ? (
                <ReviewInboxView
                  items={taskQueryResult.data.reviewItems}
                  bitbucketBaseUrl={bitbucketBaseUrl}
                  jiraBaseUrl={jiraBaseUrl}
                  onConfirm={handleConfirmSuggestion}
                  onReject={handleRejectSuggestion}
                  onRelink={(item: ReviewSuggestionItem) =>
                    setSelectedBranchForLink(toBranchRow(item))
                  }
                  onConfirmAll={handleConfirmAll}
                />
              ) : (
                <EmptyState
                  icon={Inbox}
                  title="Không có gợi ý chờ duyệt"
                  hint="Tất cả các nhánh Bitbucket đã được xác nhận hoặc chưa có ứng viên mới từ Pull Request."
                />
              )}
            </>
          )}

          {/* 4: Unlinked branches */}
          {filters.view === "unlinked" && (
            <>
              {taskQueryResult.data?.unlinkedItems && taskQueryResult.data.unlinkedItems.length > 0 ? (
                <UnlinkedBranchView
                  items={taskQueryResult.data.unlinkedItems}
                  bitbucketBaseUrl={bitbucketBaseUrl}
                  onLink={(item: UnlinkedBranchItem) =>
                    setSelectedBranchForLink(toBranchRow(item))
                  }
                  onLinkMany={(picked: UnlinkedBranchItem[]) => {
                    setBulkLinkIds(picked.map((p) => p.id));
                    setSelectedBranchForLink(toBranchRow(picked[0]));
                  }}
                />
              ) : (
                <EmptyState
                  icon={GitBranch}
                  title="Tất cả các nhánh đã có Jira task"
                  hint="Không tìm thấy work branch nào chưa được liên kết với Jira."
                />
              )}
            </>
          )}

          {/* 5: Technical all-branches table */}
          {filters.view === "all-branches" && (
            <>
              {branchQueryResult.data?.items && branchQueryResult.data.items.length > 0 ? (
                <>
                  <div className="hidden md:block">
                    <BranchTable
                      items={branchQueryResult.data.items}
                      bitbucketBaseUrl={bitbucketBaseUrl}
                      jiraBaseUrl={jiraBaseUrl}
                      onSelectBranch={(b) => setSelectedBranchForDrawer(b)}
                      onOpenLinkDialog={(b) => setSelectedBranchForLink(b)}
                    />
                  </div>
                  <div className="md:hidden">
                    <BranchCardList
                      items={branchQueryResult.data.items}
                      bitbucketBaseUrl={bitbucketBaseUrl}
                      jiraBaseUrl={jiraBaseUrl}
                      onSelectBranch={(b) => setSelectedBranchForDrawer(b)}
                      onOpenLinkDialog={(b) => setSelectedBranchForLink(b)}
                    />
                  </div>
                </>
              ) : (
                <BranchEmptyState
                  hasFilters={filters.q !== "" || filters.project !== "ALL"}
                  onResetFilters={resetFilters}
                />
              )}
            </>
          )}

          {/* Pagination Controls */}
          {activePage && activePage.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border pt-4 text-xs">
              <span className="text-muted-foreground">
                Trang {activePage.index} / {activePage.totalPages} ({activePage.totalItems.toLocaleString()}{" "}
                mục)
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={activePage.index <= 1}
                  onClick={() => updateFilters({ page: activePage.index - 1 })}
                  className="h-8 gap-1 text-xs cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Trước
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={activePage.index >= activePage.totalPages}
                  onClick={() => updateFilters({ page: activePage.index + 1 })}
                  className="h-8 gap-1 text-xs cursor-pointer"
                >
                  Sau
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Relink / Link Modal Dialog */}
      {selectedBranchForLink && (
        <BranchLinkDialog
          branch={selectedBranchForLink}
          bulkIds={bulkLinkIds}
          bitbucketBaseUrl={bitbucketBaseUrl}
          open={Boolean(selectedBranchForLink)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedBranchForLink(null);
              setBulkLinkIds(undefined);
            }
          }}
          onSuccess={(note) => {
            showToast(note ? `Cập nhật liên kết Jira task thành công — ${note}` : "Cập nhật liên kết Jira task thành công");
            setSelectedBranchForLink(null);
            setBulkLinkIds(undefined);
          }}
        />
      )}

      {/* Attach unlinked branches to a task (from the task list) */}
      {attachTask && (
        <TaskBranchLinkDialog
          key={attachTask.jiraKey}
          jiraKey={attachTask.jiraKey}
          summary={attachTask.summary}
          open
          onOpenChange={(open) => {
            if (!open) setAttachTask(null);
          }}
          onSuccess={(note) =>
            showToast(note ? `Đã gắn nhánh vào ${attachTask.jiraKey} — ${note}` : `Đã gắn nhánh vào ${attachTask.jiraKey}`)
          }
        />
      )}

      {/* Bulk-create pull requests for a task's branches (one per repo) */}
      {prTask && (
        <TaskPrCreateDialog
          key={prTask.jiraKey}
          jiraKey={prTask.jiraKey}
          summary={prTask.summary}
          open
          onOpenChange={(open) => {
            if (!open) setPrTask(null);
          }}
          onSuccess={(note) => showToast(`${prTask.jiraKey}: ${note}`)}
        />
      )}

      {/* Branch Detail Sheet */}
      {selectedBranchForDrawer && (
        <BranchDetailSheet
          branch={selectedBranchForDrawer}
          bitbucketBaseUrl={bitbucketBaseUrl}
          jiraBaseUrl={jiraBaseUrl}
          onClose={() => setSelectedBranchForDrawer(null)}
          onOpenLinkDialog={(b: BranchRowItem) => {
            setSelectedBranchForDrawer(null);
            setSelectedBranchForLink(b);
          }}
          onConfirmSuggestion={(b: BranchRowItem) => handleConfirmSuggestion(b.id)}
          onUnlinkBranch={(b: BranchRowItem) => handleUnlinkBranch(b.id)}
        />
      )}
    </div>
    </PageContainer>
  );
}
