"use client";

import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/shared/page-header";
import { ListChecks } from "lucide-react";
import { BulkConfirmDialog } from "./bulk-confirm-dialog";
import { BulkHistoryCard } from "./bulk-history-card";
import { BulkActionBar, BulkProgressSteps, BulkTopNav, StandardizationBanner } from "./bulk-header-parts";
import { BulkPreviewCard } from "./bulk-preview-step";
import { BulkSelectCard } from "./bulk-select-card";
import { BulkConfigureCard } from "./bulk-configure-card";
import { useBulkSelection } from "./lib/use-bulk-selection";
import { useBulkConfigure } from "./lib/use-bulk-configure";
import { useBulkPreview } from "./lib/use-bulk-preview";
import { useBulkOperations } from "./lib/use-bulk-operations";

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
    buildAction: configure.buildAction,
    targetStatus: configure.targetStatus,
    onBeforePreview: () => operations.setActiveOp(null),
  });

  const operations = useBulkOperations({
    preview: preview.preview,
    selectionMode: selection.selectionMode,
    onClearSelected: selection.clearSelected,
    setPreviewError: preview.setPreviewError,
  });

  function handleProjectChange(newProject: string) {
    selection.handleProjectChange(newProject);
    configure.resetConfigure();
    preview.resetPreview();
  }

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
        actionReady={Boolean(configure.buildAction())}
        hasPreview={Boolean(preview.preview)}
      />

      {/* Standardization Banner */}
      {selection.returnTo === "standardization" && selection.initialKeys.length > 0 && (
        <StandardizationBanner count={selection.initialKeys.length} />
      )}

      {/* Step 1 — Project Scope & Task Selection */}
      <BulkSelectCard
        filterProject={selection.filterProject}
        projectOptions={selection.projectOptions}
        projectIssuesCount={selection.projectIssues.length}
        onProjectChange={handleProjectChange}
        selectionMode={selection.selectionMode}
        taskFilters={selection.taskFilters}
        availableAssignees={selection.availableAssignees}
        statusOptions={configure.statusOptions}
        epicOptions={selection.epicOptions}
        labelOptions={selection.labelOptions}
        priorityOptions={selection.priorityOptions}
        myName={session?.user?.jiraUsername}
        filteredIssues={selection.filteredIssues}
        onSelectionModeChange={selection.setSelectionMode}
        onTaskFiltersChange={selection.setTaskFilters}
        allSelected={selection.allSelected}
        selected={selection.selected}
        filterOnlySelected={selection.filterOnlySelected}
        sortOption={selection.sortOption}
        onToggleAll={selection.toggleAll}
        onFilterOnlySelectedChange={selection.setFilterOnlySelected}
        onSortOptionChange={selection.setSortOption}
        isIssuesLoading={selection.isIssuesLoading}
        initialKeysSet={selection.initialKeysSet}
        jiraBaseUrl={selection.jiraBaseUrl}
        onToggle={selection.toggle}
        loadedCount={selection.issues.length}
        totalServerIssues={selection.totalServerIssues}
        isLoadingMore={selection.isLoadingMore}
        effectiveCount={selection.effectiveCount}
        onLoadMore={selection.handleLoadMore}
      />

      {/* Step 2 — Field selection & input */}
      <BulkConfigureCard
        filterProject={selection.filterProject}
        operationKind={configure.operationKind}
        effectiveCount={selection.effectiveCount}
        onOperationKindChange={configure.handleOperationKindChange}
        worklogDuration={configure.worklogDuration}
        setWorklogDuration={configure.setWorklogDuration}
        isWorklogDurationValid={configure.isWorklogDurationValid}
        worklogStarted={configure.worklogStarted}
        setWorklogStarted={configure.setWorklogStarted}
        worklogComment={configure.worklogComment}
        setWorklogComment={configure.setWorklogComment}
        allProjectStatuses={configure.allProjectStatuses}
        targetStatus={configure.targetStatus}
        setTargetStatus={configure.setTargetStatus}
        fieldsLoading={configure.fieldsLoading}
        availableFieldMap={configure.availableFieldMap}
        enabledFields={configure.enabledFields}
        onToggleField={configure.toggleField}
        values={configure.fieldState.values}
        setters={configure.fieldState.setters}
        availableAssignees={selection.availableAssignees}
        labelOptions={selection.labelOptions}
        priorityOptions={selection.priorityOptions}
        versionOptions={configure.versionOptions}
        versionsLoading={configure.versionsLoading}
        isEstimateValid={configure.isEstimateValid}
        resetPreview={preview.resetPreview}
        previewError={preview.previewError}
      />

      {!preview.preview && (
        <BulkActionBar
          filterProject={selection.filterProject}
          count={selection.effectiveCount}
          previewing={preview.previewing}
          disabled={
            preview.previewing ||
            (selection.selectionMode === "pick" && selection.selected.size === 0) ||
            !selection.filterProject ||
            !configure.buildAction()
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

      {/* Operations History */}
      <BulkHistoryCard
        activeOp={operations.activeOp}
        jiraBaseUrl={selection.jiraBaseUrl}
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
