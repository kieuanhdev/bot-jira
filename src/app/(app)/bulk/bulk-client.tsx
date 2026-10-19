"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/shared/page-header";
import { ListChecks } from "lucide-react";
import { BulkConfirmDialog } from "./bulk-confirm-dialog";
import { BulkHistoryCard } from "./bulk-history-card";
import { BulkRunCard } from "./bulk-run-card";
import { BulkActionBar, BulkProgressSteps, BulkTopNav, StandardizationBanner } from "./bulk-header-parts";
import { BulkPreviewCard } from "./bulk-preview-step";
import { BulkSelectCard } from "./bulk-select-card";
import { BulkConfigureCard } from "./bulk-configure-card";
import { useBulkSelection } from "./lib/use-bulk-selection";
import { useBulkConfigure } from "./lib/use-bulk-configure";
import { useBulkPreview } from "./lib/use-bulk-preview";
import { useBulkOperations } from "./lib/use-bulk-operations";
import { effectiveCountLabel } from "./lib/bulk-utils";

export function BulkClient() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const selection = useBulkSelection({
    searchParams,
    sessionUsername: session?.user?.jiraUsername,
  });

  const configure = useBulkConfigure({
    filterProject: selection.filterProject,
    projectIssues: selection.projectIssues,
    filtersData: selection.filtersData,
    searchParams,
    onResetPreview: () => preview.resetPreview(),
  });

  const preview = useBulkPreview({
    filterProject: selection.filterProject,
    selectionMode: selection.selectionMode,
    taskFilters: selection.taskFilters,
    selected: selection.selected,
    action: configure.action,
    targetStatus: configure.targetStatus,
    quickFilter: selection.quickFilter,
    onBeforePreview: () => operations.setActiveOp(null),
  });

  const operations = useBulkOperations({
    preview: preview.preview,
    selectionMode: selection.selectionMode,
    onClearSelected: selection.clearSelected,
    setPreviewError: preview.setPreviewError,
    onOperationConfirmed: () => preview.resetPreview(),
    initialActiveOp: searchParams?.get("operation"),
  });

  function handleProjectChange(newProject: string) {
    selection.handleProjectChange(newProject);
    configure.resetConfigure();
    preview.resetPreview();
  }

  useEffect(() => {
    if (!operations.activeOp) return;
    const el = document.getElementById("bulk-run-card");
    if (!el) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  }, [operations.activeOp]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      {/* Top Navigation Switcher */}
      <BulkTopNav />

      <PageHeader
        eyebrow="Không gian làm việc Jira"
        icon={ListChecks}
        title="Cập nhật hàng loạt"
        description="Chọn task, chọn thay đổi, xem trước rồi mới chạy."
      />

      {/* Progress Steps */}
      <BulkProgressSteps
        filterProject={selection.filterProject}
        effectiveCount={selection.effectiveCount}
        operationKind={configure.operationKind}
        actionReady={Boolean(configure.action)}
        hasPreview={Boolean(preview.preview)}
      />

      {/* Standardization Banner */}
      {selection.returnTo === "standardization" && selection.initialKeys.length > 0 && (
        <StandardizationBanner count={selection.initialKeys.length} />
      )}

      {/* Step 1 — Project Scope & Task Selection */}
      <BulkSelectCard
        selection={selection}
        onProjectChange={handleProjectChange}
        statusOptions={configure.statusOptions}
        myName={session?.user?.jiraUsername}
      />

      {/* Step 2 — Field selection & input */}
      <BulkConfigureCard
        configure={configure}
        selection={selection}
        resetPreview={preview.resetPreview}
        previewError={preview.previewError}
      />

      {!preview.preview && (
        <BulkActionBar
          filterProject={selection.filterProject}
          countLabel={
            effectiveCountLabel({
              selectionMode: selection.selectionMode,
              effectiveCount: selection.effectiveCount,
              loadedCount: selection.issues.length,
              totalServerIssues: selection.totalServerIssues,
            }).label
          }
          previewing={preview.previewing}
          disabled={
            preview.previewing ||
            (selection.selectionMode === "pick" && selection.selected.size === 0) ||
            !selection.filterProject ||
            !configure.action
          }
          label={
            selection.selectionMode === "filter"
              ? "Xem trước thay đổi bộ lọc"
              : `Xem trước ${selection.selected.size > 0 ? `${selection.selected.size} ` : ""}thay đổi`
          }
          onPreview={preview.doPreview}
        />
      )}

      {/* Step 3 — Preview + Confirm */}
      {preview.preview && (
        <BulkPreviewCard
          preview={preview.preview}
          previewOutdated={preview.previewOutdated}
          isLogWorkOp={preview.isLogWorkOp}
          isTransitionOp={preview.isTransitionOp}
          worklogDuration={configure.worklogDuration}
          targetStatus={configure.targetStatus}
          previewCounts={preview.previewCounts}
          previewView={preview.previewView}
          visiblePreviewItems={preview.visiblePreviewItems}
          jiraBaseUrl={selection.jiraBaseUrl}
          confirming={operations.confirming}
          confirmLabel={preview.confirmLabel}
          onRefresh={preview.doPreview}
          onChangeView={preview.setPreviewView}
          onOpenConfirm={() => operations.setConfirmOpen(true)}
          onCancel={preview.doCancelPreview}
        />
      )}

      {/* Run Progress */}
      {operations.activeOp && (
        <BulkRunCard
          id={operations.activeOp}
          jiraBaseUrl={selection.jiraBaseUrl}
          onClose={() => operations.setActiveOp(null)}
        />
      )}

      {/* Operations History */}
      <BulkHistoryCard
        activeOp={operations.activeOp}
        opsLoaded={operations.opsLoaded}
        ops={operations.ops}
        onSelectOp={operations.setActiveOp}
        onRetry={operations.doRetry}
      />

      {/* Confirmation Dialog */}
      <BulkConfirmDialog
        open={operations.confirmOpen}
        onOpenChange={operations.setConfirmOpen}
        isLogWorkOp={preview.isLogWorkOp}
        worklogDuration={configure.worklogDuration}
        preview={preview.preview}
        filterProject={selection.filterProject}
        confirmLabel={preview.confirmLabel}
        confirming={operations.confirming}
        onConfirm={() => {
          operations.setConfirmOpen(false);
          void operations.doConfirm();
        }}
      />
    </div>
  );
}
