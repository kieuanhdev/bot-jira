"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Rocket, RefreshCw, Plus, PackageOpen, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchField } from "@/components/shared/search-field";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { ReleaseSummaryCards } from "./release-summary-cards";
import { ReleaseCreateDialog } from "./release-create-dialog";
import { ReleaseCard } from "./release-card";
import { useReleaseController } from "./lib/use-release-controller";

export function ReleaseClient() {
  const {
    canManage,
    canPublish,
    selectedProject,
    setSelectedProject,
    selectedFilter,
    setSelectedFilter,
    searchQuery,
    setSearchQuery,
    syncMessage,
    setSyncMessage,
    createOpen,
    setCreateOpen,
    createProject,
    setCreateProject,
    createVersion,
    setCreateVersion,
    createDesc,
    setCreateDesc,
    createError,
    syncMutation,
    createMutation,
    isLoading,
    refetch,
    isRefetching,
    jiraBaseUrl,
    syncMeta,
    isSyncPending,
    permissionData,
    isPermissionLoading,
    isPermissionFetching,
    permissionError,
    refetchPermission,
    summary,
    projectList,
    filteredReleases,
    handleSync,
    handleCreateRelease,
  } = useReleaseController();

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <PageHeader
        icon={Rocket}
        title="Quản lý phát hành"
        description="Theo dõi Fix Version Jira và trạng thái merge Git từ Bitbucket"
        actions={
          <>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncMutation.isPending || isRefetching}
            className="gap-1.5 cursor-pointer text-xs"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncMutation.isPending || isRefetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Đồng bộ từ Jira
          </Button>

          {selectedProject === "all" ? (
            <span className="text-xs text-muted-foreground italic px-2 py-1 bg-muted/50 rounded border border-border/50">
              Chọn một dự án để tạo bản phát hành
            </span>
          ) : isPermissionLoading || (isPermissionFetching && !permissionData) ? (
            <Skeleton className="h-8 w-36 rounded-md" />
          ) : permissionError ? (
            permissionError.status === 428 ? (
              <Link
                href="/settings"
                className="text-xs text-primary hover:underline flex items-center gap-1.5 px-2.5 py-1 rounded bg-primary/10 border border-primary/20 transition-colors cursor-pointer"
              >
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                <span>Cấu hình Jira token trong Cài đặt</span>
              </Link>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                <span className="text-destructive font-medium">Lỗi kiểm tra quyền</span>
                <button
                  type="button"
                  onClick={() => refetchPermission()}
                  className="text-primary hover:underline cursor-pointer ml-1"
                >
                  Thử lại
                </button>
              </div>
            )
          ) : permissionData?.canCreateVersion ? (
            <Button
              size="sm"
              onClick={() => {
                setCreateProject(selectedProject);
                setCreateOpen(true);
              }}
              disabled={isPermissionFetching}
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 cursor-pointer text-xs"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Tạo bản phát hành
            </Button>
          ) : (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 px-2 py-1 rounded bg-muted/60 border border-border">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
              <span>Không có quyền tạo Version trong dự án {selectedProject}</span>
            </div>
          )}
          </>
        }
      />

      {/* Sync message banner */}
      {syncMessage && (
        <FeedbackBanner
          tone={syncMessage.tone}
          className="text-xs"
          action={
            <button
              type="button"
              onClick={() => setSyncMessage(null)}
              className="text-muted-foreground hover:text-foreground text-xs cursor-pointer"
            >
              Đóng
            </button>
          }
        >
          {syncMessage.text}
        </FeedbackBanner>
      )}

      {/* Stale warning banner if sync has errors but stale DB data is visible */}
      {syncMeta?.stale && syncMeta?.lastError && (
        <FeedbackBanner tone="warning" className="text-xs">
          Cảnh báo: Không thể làm mới dữ liệu từ Jira ({syncMeta.lastError}). Đang hiển thị bản phát hành đã lưu trước đó.
        </FeedbackBanner>
      )}

      {/* KPI Summary Cards */}
      <ReleaseSummaryCards
        summary={summary}
        selectedFilter={selectedFilter}
        onSelectFilter={setSelectedFilter}
      />

      {/* Filters & Search row */}
      <FilterBar
        className="pt-2"
        actions={
          <SearchField
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Tìm theo tên, project, task..."
            ariaLabel="Tìm theo tên, project, task"
            className="w-full sm:w-64"
          />
        }
      >
        {/* Project selector */}
        <div className="w-48">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Chọn dự án" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                Tất cả dự án
              </SelectItem>
              {projectList.map((key) => (
                <SelectItem key={key} value={key} className="text-xs">
                  Dự án: {key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Quick filter pills */}
        <SegmentedControl
          aria-label="Lọc theo trạng thái"
          value={selectedFilter}
          onChange={setSelectedFilter}
          className="hidden lg:flex"
          items={[
            { value: "all", label: "Tất cả" },
            { value: "in_progress", label: "Đang thực hiện" },
            { value: "ready", label: "Sẵn sàng" },
            { value: "empty", label: "Chưa có task" },
            { value: "released", label: "Đã phát hành" },
          ]}
        />
      </FilterBar>

      {/* Release List */}
      <div className="space-y-3.5">
        {isLoading || isSyncPending ? (
          // Loading Skeletons
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="p-5 rounded-xl border border-border bg-card space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-36" />
                  <Skeleton className="h-6 w-24" />
                </div>
                <Skeleton className="h-8 w-28" />
              </div>
              <Skeleton className="h-12 w-full rounded-lg" />
              <div className="flex justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ))
        ) : filteredReleases.length === 0 ? (
          // Differentiate empty states based on sync metadata
          <div className="py-16 text-center rounded-xl border border-dashed border-border bg-card p-8 flex flex-col items-center justify-center">
            {searchQuery ? (
              <>
                <div className="p-4 rounded-full bg-muted/60 mb-3">
                  <PackageOpen className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Không tìm thấy bản phát hành nào
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  Không có phiên bản nào khớp với từ khóa tìm kiếm &quot;{searchQuery}&quot;.
                </p>
              </>
            ) : syncMeta?.state === "auth_required" ? (
              <>
                <div className="p-4 rounded-full bg-amber-500/10 mb-3">
                  <AlertCircle className="h-8 w-8 text-amber-500" aria-hidden="true" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Cần cấu hình tài khoản Jira
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  Bạn cần cấu hình token Jira cá nhân trong phần Cài đặt để đồng bộ và xem các bản phát hành.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-4 gap-1.5 text-xs">
                  <Link href="/settings">Đi đến Cài đặt</Link>
                </Button>
              </>
            ) : syncMeta?.state === "forbidden" ? (
              <>
                <div className="p-4 rounded-full bg-rose-500/10 mb-3">
                  <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Không có quyền truy cập dự án {selectedProject}
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  Tài khoản Jira của bạn không có quyền xem hoặc quản lý Fix Version trong dự án này.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={isSyncPending}
                  className="mt-4 gap-1.5 text-xs cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Thử lại
                </Button>
              </>
            ) : syncMeta?.state === "failed" ? (
              <>
                <div className="p-4 rounded-full bg-rose-500/10 mb-3">
                  <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Đồng bộ bản phát hành thất bại
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  {syncMeta.lastError || "Đã xảy ra lỗi khi kết nối đến Jira để lấy danh sách bản phát hành."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={isSyncPending}
                  className="mt-4 gap-1.5 text-xs cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Thử lại
                </Button>
              </>
            ) : syncMeta?.state === "empty" ? (
              <>
                <div className="p-4 rounded-full bg-muted/60 mb-3">
                  <PackageOpen className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Dự án {selectedProject} chưa có Fix Version trên Jira
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  Hệ thống đã đồng bộ thành công nhưng dự án này chưa có phiên bản phát hành nào trên Jira.
                </p>
                <div className="mt-4 flex items-center gap-2">
                  {canManage && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setCreateProject(selectedProject);
                        setCreateOpen(true);
                      }}
                      className="gap-1.5 text-xs cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Tạo bản phát hành
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSync}
                    disabled={isSyncPending}
                    className="gap-1.5 text-xs cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Đồng bộ lại
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="p-4 rounded-full bg-muted/60 mb-3">
                  <PackageOpen className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  {selectedProject !== "all"
                    ? `Chưa đồng bộ bản phát hành dự án ${selectedProject}`
                    : "Chưa có bản phát hành nào"}
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  Chưa có Fix Version nào trong phạm vi đã chọn hoặc cần đồng bộ từ Jira.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={isSyncPending}
                  className="mt-4 gap-1.5 text-xs cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Đồng bộ từ Jira ngay
                </Button>
              </>
            )}
          </div>
        ) : (
          filteredReleases.map((release) => (
            <ReleaseCard
              key={release.id}
              release={release}
              canManage={canManage}
              canPublish={canPublish}
              jiraBaseUrl={jiraBaseUrl}
              onRefresh={refetch}
            />
          ))
        )}
      </div>

      {/* Create Release Dialog */}
      <ReleaseCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        project={createProject}
        onProjectChange={setCreateProject}
        projectList={projectList}
        selectedProject={selectedProject}
        version={createVersion}
        onVersionChange={setCreateVersion}
        description={createDesc}
        onDescriptionChange={setCreateDesc}
        error={createError}
        pending={createMutation.isPending}
        onSubmit={handleCreateRelease}
      />
    </div>
  );
}
