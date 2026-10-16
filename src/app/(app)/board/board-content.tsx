"use client";

import type { RefObject } from "react";
import dynamic from "next/dynamic";
import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/async-state";
import { BoardSkeleton } from "./board-skeleton";
import type { IssueItem } from "@/hooks/use-issues";
import type { Transition, ViewMode } from "./lib/board-types";
import type { ListOptions } from "./board-list-view";
import type { useBoardColumnsModel } from "./hooks/use-board-columns-model";
import type { useBoardActionsController } from "./hooks/use-board-actions-controller";

const BoardKanbanView = dynamic(
  () => import("./board-kanban-view").then((m) => m.BoardKanbanView),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full" /> }
);

const BoardListView = dynamic(
  () => import("./board-list-view").then((m) => m.BoardListView),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full" /> }
);

export interface BoardContentProps {
  isLoading: boolean;
  issuesError: boolean;
  hasIssueData: boolean;
  selectedProject: string;
  refetchIssues: () => void;
  issues: IssueItem[];
  effectiveView: ViewMode;
  boardScrollRef: RefObject<HTMLDivElement | null>;
  columnsModel: ReturnType<typeof useBoardColumnsModel>;
  actions: ReturnType<typeof useBoardActionsController>;
  transitionCache: React.MutableRefObject<Map<string, Transition[]>>;
  fetchTransitions: (key: string) => Promise<Transition[]>;
  dndDisabled: boolean;
  onOpen: (issue: IssueItem) => void;
  assignees: string[];
  registerRef: (key: string, el: HTMLElement | null) => void;
  focusKey: string | null;
  hiddenTableCols: Set<string>;
  listOptions: ListOptions;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
}

export function BoardContent({
  isLoading,
  issuesError,
  hasIssueData,
  selectedProject,
  refetchIssues,
  issues,
  effectiveView,
  boardScrollRef,
  columnsModel,
  actions,
  transitionCache,
  fetchTransitions,
  dndDisabled,
  onOpen,
  assignees,
  registerRef,
  focusKey,
  hiddenTableCols,
  listOptions,
  hasMore,
  loadingMore,
  loadMore,
}: BoardContentProps) {
  if (isLoading || columnsModel.isLoadingStatuses) {
    return (
      <div className="flex h-full flex-col gap-3" aria-busy="true" aria-label="Đang tải">
        <Skeleton className="h-9 w-full max-w-xl" />
        <Skeleton className="h-9 w-full" />
        <BoardSkeleton columnCount={columnsModel.columns.length || 5} />
      </div>
    );
  }

  if (issuesError && !hasIssueData) {
    return (
      <ErrorState
        title={`Không tải được task của ${selectedProject}`}
        message="Yêu cầu tới máy chủ bị lỗi. Hãy thử tải lại."
        onRetry={refetchIssues}
        retryLabel="Thử lại"
        className="flex-1"
      />
    );
  }

  if (issues.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="Không có task nào để hiển thị"
        hint="Hãy thử điều chỉnh bộ lọc, hoặc làm mới dữ liệu để cập nhật bảng."
        className="flex-1"
      />
    );
  }

  if (effectiveView === "board") {
    return (
      <BoardKanbanView
        boardScrollRef={boardScrollRef}
        issues={issues}
        columns={columnsModel.columns}
        statusCategoryMap={columnsModel.statusCategoryMap}
        transitionCache={transitionCache}
        fetchTransitions={fetchTransitions}
        findColumnForIssue={columnsModel.findColumnForIssue}
        boardColumnsRender={columnsModel.boardColumnsRender}
        transitionBusy={actions.transitionBusy}
        dndDisabled={dndDisabled}
        optimistic={columnsModel.optimistic}
        visibleColumnsLength={columnsModel.visibleColumns.length}
        growColumn={columnsModel.growColumn}
        toggleCollapse={columnsModel.toggleCollapse}
        hideColumn={columnsModel.hideColumn}
        onOpen={onOpen}
        onQuickAction={actions.stableQuickAction}
        onTransition={actions.stableTransition}
        assignees={assignees}
        registerRef={registerRef}
        focusKey={focusKey}
      />
    );
  }

  return (
    <BoardListView
      issues={issues}
      hiddenTableCols={hiddenTableCols}
      options={listOptions}
      statusOverrides={columnsModel.optimistic}
      onEdits={actions.stableEdits}
      onTransition={actions.stableInlineTransition}
      onBulkTransition={actions.stableBulkTransition}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onOpen={onOpen}
      onLoadMore={loadMore}
    />
  );
}
