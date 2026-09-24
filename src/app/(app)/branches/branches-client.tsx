"use client";

import { useState, useTransition, useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import { RefreshCw, AlertCircle, ChevronLeft, ChevronRight, Inbox, GitBranch } from "lucide-react";

import { BranchToolbar } from "./branch-toolbar";
import { TaskDeliveryList } from "./task-delivery-list";
import { ReviewInboxView } from "./review-inbox-view";
import { UnlinkedBranchView } from "./unlinked-branch-view";
import { BranchTable } from "./branch-table";
import { BranchCardList } from "./branch-card-list";
import { BranchDetailSheet } from "./branch-detail-sheet";
import { BranchLinkDialog } from "./branch-link-dialog";
import { BranchEmptyState } from "./branch-empty-state";
import {
  type BranchFilterState,
  type BranchesQueryResult,
  type BranchRowItem,
  type TaskDeliveryQueryResult,
  type ReviewSuggestionItem,
  type UnlinkedBranchItem,
  DEFAULT_FILTERS,
} from "./branch-types";

export function BranchesClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [toast, setToast] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [selectedBranchForDrawer, setSelectedBranchForDrawer] = useState<BranchRowItem | null>(null);
  const [selectedBranchForLink, setSelectedBranchForLink] = useState<BranchRowItem | null>(null);

  const toBranchRow = useCallback((item: {
    id: string;
    repo: string;
    branch: string;
    suggestedJiraKey?: string | null;
    jiraKey?: string | null;
    prTitle?: string | null;
    prUrl?: string | null;
  }): BranchRowItem => ({
    id: item.id,
    repo: item.repo,
    branch: item.branch,
    jiraKey: item.jiraKey ?? null,
    suggestedJiraKey: item.suggestedJiraKey ?? null,
    latestCommitSha: null,
    lastCommitAt: null,
    prId: null,
    prTitle: item.prTitle ?? null,
    prUrl: item.prUrl ?? null,
    prState: null,
    prDestinationBranch: null,
    prUpdatedAt: null,
    merged: false,
    linkSource: null,
    linkConfidence: null,
    checkedAt: new Date().toISOString(),
    task: null,
    attentionSignals: [],
  }), []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Parse filters from URL search params
  const filters: BranchFilterState = useMemo(() => {
    return {
      view: (searchParams.get("view") as BranchFilterState["view"]) ?? DEFAULT_FILTERS.view,
      q: searchParams.get("q") ?? DEFAULT_FILTERS.q,
      project: searchParams.get("project") ?? DEFAULT_FILTERS.project,
      repo: searchParams.get("repo") ?? DEFAULT_FILTERS.repo,
      link: (searchParams.get("link") as BranchFilterState["link"]) ?? DEFAULT_FILTERS.link,
      pr: (searchParams.get("pr") as BranchFilterState["pr"]) ?? DEFAULT_FILTERS.pr,
      taskStatus: searchParams.get("taskStatus") ?? DEFAULT_FILTERS.taskStatus,
      assignee: searchParams.get("assignee") ?? DEFAULT_FILTERS.assignee,
      attention: (searchParams.get("attention") as BranchFilterState["attention"]) ?? DEFAULT_FILTERS.attention,
      sort: (searchParams.get("sort") as BranchFilterState["sort"]) ?? DEFAULT_FILTERS.sort,
      order: (searchParams.get("order") as BranchFilterState["order"]) ?? DEFAULT_FILTERS.order,
      page: searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : DEFAULT_FILTERS.page,
      pageSize: searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!, 10) : DEFAULT_FILTERS.pageSize,
    };
  }, [searchParams]);

  // Update URL search parameters
  const updateFilters = useCallback(
    (patch: Partial<BranchFilterState>) => {
      const next = { ...filters, ...patch };
      const params = new URLSearchParams();

      if (next.view && next.view !== DEFAULT_FILTERS.view) params.set("view", next.view);
      if (next.q) params.set("q", next.q);
      if (next.project && next.project !== "ALL") params.set("project", next.project);
      if (next.repo && next.repo !== "ALL") params.set("repo", next.repo);
      if (next.link && next.link !== "ALL") params.set("link", next.link);
      if (next.pr && next.pr !== "ALL") params.set("pr", next.pr);
      if (next.taskStatus && next.taskStatus !== "ALL") params.set("taskStatus", next.taskStatus);
      if (next.assignee && next.assignee !== "ALL") params.set("assignee", next.assignee);
      if (next.attention && next.attention !== "0") params.set("attention", next.attention);
      if (next.sort && next.sort !== DEFAULT_FILTERS.sort) params.set("sort", next.sort);
      if (next.order && next.order !== DEFAULT_FILTERS.order) params.set("order", next.order);
      if (next.page && next.page > 1) params.set("page", String(next.page));
      if (next.pageSize && next.pageSize !== DEFAULT_FILTERS.pageSize) params.set("pageSize", String(next.pageSize));

      const queryStr = params.toString();
      startTransition(() => {
        router.replace(`${pathname}${queryStr ? `?${queryStr}` : ""}`, { scroll: false });
      });
    },
    [filters, pathname, router]
  );

  const resetFilters = useCallback(() => {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }, [pathname, router]);

  // URL for task-centric workspace query
  const taskQueryUrl = useMemo(() => {
    const p = new URLSearchParams();
    p.set("view", filters.view);
    if (filters.q) p.set("q", filters.q);
    if (filters.project !== "ALL") p.set("project", filters.project);
    if (filters.repo !== "ALL") p.set("repo", filters.repo);
    if (filters.pr !== "ALL") p.set("pr", filters.pr);
    if (filters.taskStatus !== "ALL") p.set("taskStatus", filters.taskStatus);
    if (filters.assignee !== "ALL") p.set("assignee", filters.assignee);
    p.set("page", String(filters.page));
    p.set("pageSize", String(filters.pageSize));
    return `/api/branches/tasks?${p.toString()}`;
  }, [filters]);

  // URL for technical all-branches query
  const branchQueryUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    if (filters.project !== "ALL") p.set("project", filters.project);
    if (filters.repo !== "ALL") p.set("repo", filters.repo);
    if (filters.link !== "ALL") p.set("link", filters.link);
    if (filters.pr !== "ALL") p.set("pr", filters.pr);
    if (filters.taskStatus !== "ALL") p.set("taskStatus", filters.taskStatus);
    if (filters.assignee !== "ALL") p.set("assignee", filters.assignee);
    if (filters.attention !== "0") p.set("attention", filters.attention);
    p.set("sort", filters.sort);
    p.set("order", filters.order);
    p.set("page", String(filters.page));
    p.set("pageSize", String(filters.pageSize));
    return `/api/branches?${p.toString()}`;
  }, [filters]);

  const isTechnicalView = filters.view === "all-branches";

  // Query either task delivery workspace or technical branches
  const taskQueryResult = useQuery<TaskDeliveryQueryResult>({
    queryKey: ["branches-tasks", filters],
    queryFn: () => api<TaskDeliveryQueryResult>(taskQueryUrl),
    enabled: !isTechnicalView,
    placeholderData: (prev) => prev,
    refetchInterval: 60000,
  });

  const branchQueryResult = useQuery<BranchesQueryResult>({
    queryKey: ["branches", filters],
    queryFn: () => api<BranchesQueryResult>(branchQueryUrl),
    enabled: isTechnicalView,
    placeholderData: (prev) => prev,
    refetchInterval: 60000,
  });

  // Facet query to get full projects and repos list even in task view
  const facetQueryResult = useQuery<BranchesQueryResult>({
    queryKey: ["branches-facets"],
    queryFn: () => api<BranchesQueryResult>("/api/branches?pageSize=1"),
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = isTechnicalView ? branchQueryResult.isLoading : taskQueryResult.isLoading;
  const isError = isTechnicalView ? branchQueryResult.isError : taskQueryResult.isError;
  const error = isTechnicalView ? branchQueryResult.error : taskQueryResult.error;
  const refetch = isTechnicalView ? branchQueryResult.refetch : taskQueryResult.refetch;

  const freshness = isTechnicalView
    ? branchQueryResult.data?.freshness
    : facetQueryResult.data?.freshness;

  const projectOptions = facetQueryResult.data?.facets.projects ?? [];
  const repoOptions = facetQueryResult.data?.facets.repositories ?? [];

  // Handle manual "Sync now"
  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/branches/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Yêu cầu đồng bộ thất bại");
      showToast(json.queued ? "Đã đưa tác vụ đồng bộ vào hàng đợi nền" : "Đồng bộ nhánh thành công");
      await Promise.all([taskQueryResult.refetch(), branchQueryResult.refetch()]);
    } catch (e) {
      showToast(`Đồng bộ thất bại: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Confirm suggestion
  const handleConfirmSuggestion = async (branchId: string) => {
    try {
      const res = await fetch(`/api/branches/${branchId}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Không thể xác nhận gợi ý");
      }
      showToast("Đã xác nhận liên kết Jira task thành công");
      await Promise.all([taskQueryResult.refetch(), branchQueryResult.refetch()]);
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  // Reject suggestion
  const handleRejectSuggestion = async (branchId: string) => {
    try {
      const res = await fetch(`/api/branches/${branchId}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Không thể từ chối gợi ý");
      }
      showToast("Đã từ chối gợi ý liên kết");
      await Promise.all([taskQueryResult.refetch(), branchQueryResult.refetch()]);
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  // Unlink branch
  const handleUnlinkBranch = async (branchId: string) => {
    try {
      const res = await fetch(`/api/branches/${branchId}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Không thể hủy liên kết");
      }
      showToast("Đã hủy liên kết Jira task");
      await Promise.all([taskQueryResult.refetch(), branchQueryResult.refetch()]);
      setSelectedBranchForDrawer(null);
    } catch (e) {
      showToast((e as Error).message);
    }
  };

  const activePage = isTechnicalView
    ? branchQueryResult.data?.page
    : taskQueryResult.data?.page;

  const counts = taskQueryResult.data?.counts;

  return (
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Workspace Nhánh & Delivery</h1>
            {freshness?.lastSuccessAt && (
              <span className="text-xs text-muted-foreground">
                • Đã đồng bộ {timeAgo(freshness.lastSuccessAt)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Theo dõi tiến độ phân phối phần mềm theo Jira Task, quản lý nhánh Bitbucket và duyệt gợi ý liên kết.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {freshness?.stale && (
            <Badge variant="warning" className="gap-1 text-xs">
              <AlertCircle className="h-3.5 w-3.5" /> Dữ liệu đồng bộ có thể đã cũ
            </Badge>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={syncing}
            onClick={handleSyncNow}
            className="h-8 gap-1.5 text-xs text-foreground cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin text-teal-400" : ""}`} />
            {syncing ? "Đang đồng bộ..." : "Đồng bộ Bitbucket"}
          </Button>
        </div>
      </div>

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
      {isLoading && !activePage && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 py-10 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Không thể tải dữ liệu workspace</h3>
            <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="text-xs cursor-pointer">
            Thử lại
          </Button>
        </div>
      )}

      {/* View Content Rendering */}
      {!isLoading && !isError && (
        <>
          {/* 1 & 2: Task-centric views (my-work, needs-attention) */}
          {(filters.view === "my-work" || filters.view === "needs-attention") && (
            <>
              {taskQueryResult.data?.tasks && taskQueryResult.data.tasks.length > 0 ? (
                <TaskDeliveryList
                  tasks={taskQueryResult.data.tasks}
                  onOpenRelink={(jiraKey) => setSelectedBranchForLink(toBranchRow({ id: "", repo: "", branch: "", jiraKey }))}
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
                  onConfirm={handleConfirmSuggestion}
                  onReject={handleRejectSuggestion}
                  onRelink={(item: ReviewSuggestionItem) =>
                    setSelectedBranchForLink(toBranchRow(item))
                  }
                />
              ) : (
                <div className="p-12 text-center border border-dashed border-border rounded-xl space-y-2">
                  <div className="w-10 h-10 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center mx-auto">
                    <Inbox className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Không có gợi ý chờ duyệt</h3>
                  <p className="text-xs text-muted-foreground">
                    Tất cả các nhánh Bitbucket đã được xác nhận hoặc chưa có ứng viên mới từ Pull Request.
                  </p>
                </div>
              )}
            </>
          )}

          {/* 4: Unlinked branches */}
          {filters.view === "unlinked" && (
            <>
              {taskQueryResult.data?.unlinkedItems && taskQueryResult.data.unlinkedItems.length > 0 ? (
                <UnlinkedBranchView
                  items={taskQueryResult.data.unlinkedItems}
                  onLink={(item: UnlinkedBranchItem) =>
                    setSelectedBranchForLink(toBranchRow(item))
                  }
                />
              ) : (
                <div className="p-12 text-center border border-dashed border-border rounded-xl space-y-2">
                  <div className="w-10 h-10 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center mx-auto">
                    <GitBranch className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Tất cả các nhánh đã có Jira task</h3>
                  <p className="text-xs text-muted-foreground">
                    Không tìm thấy work branch nào chưa được liên kết với Jira.
                  </p>
                </div>
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
                      onSelectBranch={(b) => setSelectedBranchForDrawer(b)}
                      onOpenLinkDialog={(b) => setSelectedBranchForLink(b)}
                    />
                  </div>
                  <div className="md:hidden">
                    <BranchCardList
                      items={branchQueryResult.data.items}
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
          open={Boolean(selectedBranchForLink)}
          onOpenChange={(open) => {
            if (!open) setSelectedBranchForLink(null);
          }}
          onSuccess={async () => {
            showToast("Cập nhật liên kết Jira task thành công");
            setSelectedBranchForLink(null);
            await Promise.all([taskQueryResult.refetch(), branchQueryResult.refetch()]);
          }}
        />
      )}

      {/* Branch Detail Sheet */}
      {selectedBranchForDrawer && (
        <BranchDetailSheet
          branch={selectedBranchForDrawer}
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
  );
}
