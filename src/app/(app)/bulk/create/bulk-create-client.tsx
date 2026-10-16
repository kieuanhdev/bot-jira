"use client";

import Link from "next/link";
import { useBulkCreateController } from "./lib/use-bulk-create-controller";
import { BulkCreateEditorShell } from "./bulk-create-editor-shell";
import { CreatePreview } from "./create-preview";
import { CreateProgress } from "./create-progress";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PlusCircle,
  RotateCcw,
  FolderKanban,
  AlertCircle,
  ListPlus,
  Edit3,
  Maximize2,
  Sparkles,
} from "lucide-react";
import { BulkCreateStepper } from "./bulk-create-stepper";
import { BulkCreateProjectDialog } from "./bulk-create-project-dialog";

export function BulkCreateClient() {
  const {
    isProjectsLoading,
    projectKey,
    availableProjects,
    step,
    setStep,
    items,
    setItems,
    defaults,
    setDefaults,
    setSource,
    previewData,
    activeOperationId,
    focusRow,
    setFocusRow,
    focusField,
    setFocusField,
    isEditorFullscreen,
    setIsEditorFullscreen,
    handleToggleFullscreen,
    draftAvailable,
    handleRestoreDraft,
    handleDiscardDraft,
    isSavingDraft,
    draftSavedTime,
    metadata,
    metadataLoading,
    metadataError,
    refetchMetadata,
    previewMutation,
    confirmMutation,
    filledCount,
    handleResetAll,
    handleDiscardBlockedRows,
    handleProjectSelect,
    confirmProjectDialogOpen,
    setConfirmProjectDialogOpen,
    pendingProjectKey,
    setPendingProjectKey,
    applyProjectChange,
  } = useBulkCreateController();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      {/* Top Segmented Navigation Switcher */}
      <nav aria-label="Điều hướng tác vụ hàng loạt" className="flex items-center">
        <div className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 border border-border/80 shadow-2xs">
          <Link
            href="/bulk"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-background/50 cursor-pointer transition-all duration-150"
          >
            <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Cập nhật task hàng loạt</span>
          </Link>
          <Link
            href="/bulk/create"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-primary bg-background shadow-xs cursor-pointer transition-all duration-150 border border-border/50"
          >
            <ListPlus className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Tạo task mới hàng loạt</span>
            <span className="ml-0.5 text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-mono font-medium">
              DC REST v2
            </span>
          </Link>
        </div>
      </nav>

      {/* Header Hero */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border/80 bg-card/60 p-4 sm:p-5 backdrop-blur-xs shadow-xs">
        <div>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Jira Data Center • Batch Operations</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Tạo task hàng loạt theo dự án
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground leading-relaxed">
            Soạn thảo danh sách công việc, copy-paste từ Excel/Google Sheets hoặc nhập file CSV. Hệ thống kiểm tra hợp lệ thời gian thực và tạo task an toàn qua hàng đợi background.
          </p>
        </div>

        {/* Project Selector & Actions in Header */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start sm:self-center">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 shadow-2xs">
            <FolderKanban className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="text-xs text-muted-foreground font-medium">Dự án:</span>
            <div className="w-28 sm:w-32">
              {isProjectsLoading ? (
                <Skeleton className="h-5 w-24 rounded" />
              ) : (
                <Select value={projectKey} onValueChange={handleProjectSelect} disabled={availableProjects.length === 0}>
                  <SelectTrigger className="h-7 border-0 p-0 text-xs font-bold text-foreground focus:ring-0 cursor-pointer shadow-none">
                    <SelectValue placeholder={availableProjects.length === 0 ? "Không có dự án" : "Chọn dự án"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProjects.map((p) => (
                      <SelectItem key={p} value={p} className="text-xs cursor-pointer font-medium">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <Badge variant={filledCount > 0 ? "info" : "secondary"} className="h-8 px-2.5 text-xs font-medium">
            {filledCount} task sẵn sàng
          </Badge>

          {step === "input" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToggleFullscreen}
              className="h-8 gap-1.5 text-xs font-medium cursor-pointer border-border hover:bg-muted text-foreground"
            >
              <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span>Toàn màn hình</span>
            </Button>
          )}
        </div>
      </header>

      {/* Interactive Progress Steps */}
      <BulkCreateStepper
        step={step}
        onStepChange={setStep}
        filledCount={filledCount}
        previewData={previewData}
        activeOperationId={activeOperationId}
      />

      {/* Step 1: Input & Defaults */}
      {step === "input" && (
        <div className="space-y-4">
          {/* Skeleton while projects are loading */}
          {isProjectsLoading && (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-80 w-full rounded-lg" />
            </div>
          )}

          {/* Empty State when no project is synced */}
          {!isProjectsLoading && availableProjects.length === 0 && (
            <EmptyState
              icon={FolderKanban}
              title="Chưa có project nào được đồng bộ"
              hint="Vui lòng cấu hình đồng bộ dự án Jira trong cài đặt hoặc liên hệ quản trị viên."
            />
          )}

          {/* Prompt when projects exist but none is selected */}
          {!isProjectsLoading && availableProjects.length > 0 && !projectKey && (
            <Card className="border-dashed border-border p-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FolderKanban className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                Chưa chọn dự án Jira
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Vui lòng chọn một dự án ở thanh tiêu đề trên để tải loại issue, phiên bản và nhập danh sách task.
              </p>
            </Card>
          )}

          {/* Loading Metadata Skeleton */}
          {!isProjectsLoading && Boolean(projectKey) && metadataLoading && (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-80 w-full rounded-lg" />
            </div>
          )}

          {/* Error State */}
          {metadataError && !metadataLoading && (
            <Card className="border-destructive/30 bg-destructive/5 p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Không thể tải thông tin dự án {projectKey}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                {metadataError instanceof Error ? metadataError.message : "Đã xảy ra lỗi khi kết nối tới Jira. Vui lòng kiểm tra lại token cá nhân trong Cài đặt."}
              </p>
              <div className="mt-4 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => refetchMetadata()}
                  className="cursor-pointer gap-2 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Thử lại
                </Button>
              </div>
            </Card>
          )}

          {/* Permission Error State */}
          {metadata && !metadata.canCreate && (
            <Card className="border-destructive/30 bg-destructive/5 p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Không thể tạo task trong dự án {projectKey}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                {metadata.permissionReason || "Tài khoản Jira của bạn không có quyền CREATE_ISSUES trên dự án này."}
              </p>
            </Card>
          )}

          {/* Main Workspace when metadata is loaded and canCreate is true */}
          {metadata && metadata.canCreate && (
            <div className="space-y-4">
              {/* Draft Restore Banner */}
              {draftAvailable && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-2xs animate-in fade-in duration-200">
                  <div className="flex items-center gap-2.5 text-xs">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0">
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">
                        Tìm thấy bản nháp chưa hoàn tất cho dự án {projectKey}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        Bạn có muốn khôi phục lại danh sách task và cài đặt mặc định đã soạn thảo từ phiên trước?
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleRestoreDraft}
                      className="h-7.5 px-3 text-xs font-semibold cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
                    >
                      Khôi phục bản nháp
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleDiscardDraft}
                      className="h-7.5 px-2.5 text-xs cursor-pointer text-muted-foreground hover:text-destructive"
                    >
                      Bỏ qua
                    </Button>
                  </div>
                </div>
              )}

              {/* Fullscreen / Inline Editor Shell */}
              <BulkCreateEditorShell
                metadata={metadata}
                projectKey={projectKey}
                availableProjects={availableProjects}
                onSelectProject={handleProjectSelect}
                defaults={defaults}
                onDefaultsChange={setDefaults}
                items={items}
                onItemsChange={setItems}
                onSourceChange={setSource}
                isFullscreen={isEditorFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
                onPreview={() => previewMutation.mutate()}
                isPreviewPending={previewMutation.isPending}
                isSavingDraft={isSavingDraft}
                draftSavedTime={draftSavedTime}
                focusRow={focusRow}
                focusField={focusField}
                onClearFocusRow={() => {
                  setFocusRow(null);
                  setFocusField(null);
                }}
              />

              {previewMutation.isError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Lỗi kiểm tra xem trước: {previewMutation.error.message}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Preview & Confirm */}
      {step === "preview" && previewData && (
        <CreatePreview
          preview={previewData}
          projectKey={projectKey}
          onBack={() => setStep("input")}
          onConfirm={() => confirmMutation.mutate()}
          isConfirming={confirmMutation.isPending}
          confirmError={confirmMutation.isError ? confirmMutation.error.message : null}
          onResetConfirmError={() => confirmMutation.reset()}
          onFixRow={(rowIndex, field) => {
            setFocusRow(rowIndex);
            setFocusField(field || null);
            setIsEditorFullscreen(true);
            setStep("input");
          }}
          onDiscardBlockedRows={handleDiscardBlockedRows}
        />
      )}

      {/* Step 3: Progress & Results */}
      {step === "progress" && activeOperationId && (
        <CreateProgress
          operationId={activeOperationId}
          onReset={handleResetAll}
        />
      )}

      {/* Project Change Confirmation Dialog */}
      <BulkCreateProjectDialog
        open={confirmProjectDialogOpen}
        onOpenChange={setConfirmProjectDialogOpen}
        pendingProjectKey={pendingProjectKey}
        onConfirm={(key) => {
          applyProjectChange(key);
          setPendingProjectKey(null);
          setConfirmProjectDialogOpen(false);
        }}
        onCancel={() => {
          setPendingProjectKey(null);
          setConfirmProjectDialogOpen(false);
        }}
      />
    </div>
  );
}
