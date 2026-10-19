"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import {
  BulkConfigureEmptyState,
  BulkFieldInputs,
  BulkFieldPicker,
  BulkOperationModeSwitch,
  BulkTransitionForm,
  BulkWorklogForm,
} from "./bulk-configure-step";
import { BulkStepBadge } from "./bulk-step-badge";
import type { BulkConfigureController } from "./lib/use-bulk-configure";
import type { BulkSelectionController } from "./lib/use-bulk-selection";

export interface BulkConfigureCardProps {
  configure: BulkConfigureController;
  selection: BulkSelectionController;
  resetPreview: () => void;
  previewError: string | null;
}

export function BulkConfigureCard({
  configure,
  selection,
  resetPreview,
  previewError,
}: BulkConfigureCardProps) {
  const {
    filterProject,
    effectiveCount,
    availableAssignees,
    labelOptions,
    priorityOptions,
  } = selection;

  const {
    operationKind,
    handleOperationKindChange: onOperationKindChange,
    worklogDuration,
    setWorklogDuration,
    isWorklogDurationValid,
    worklogStarted,
    setWorklogStarted,
    worklogComment,
    setWorklogComment,
    allProjectStatuses,
    targetStatus,
    setTargetStatus,
    fieldsLoading,
    availableFieldMap,
    enabledFields,
    toggleField: onToggleField,
    fieldState,
    versionOptions,
    versionsLoading,
    isEstimateValid,
  } = configure;
  const { values, setters } = fieldState;
  return (
    <Card className={effectiveCount === 0 ? "opacity-60" : undefined}>
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <BulkStepBadge step={2} />
          {operationKind === "log-work"
            ? "Ghi worklog"
            : operationKind === "transition"
              ? "Chuyển trạng thái"
              : "Chọn trường cần sửa"}
        </CardTitle>
        <CardDescription>
          {filterProject
            ? effectiveCount === 0
              ? "Chọn ít nhất một task ở bước 1 để tiếp tục."
              : operationKind === "log-work"
                ? "Thời lượng sẽ được cộng dồn vào từng task đã chọn."
                : operationKind === "transition"
                  ? "Chọn trạng thái đích cho các task đã chọn."
                  : "Bật các trường cần sửa rồi nhập giá trị mới."
            : "Chọn dự án ở bước 1 trước."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-5">
        {filterProject && (
          <BulkOperationModeSwitch
            operationKind={operationKind}
            onChange={onOperationKindChange}
          />
        )}

        {!filterProject ? (
          <BulkConfigureEmptyState />
        ) : operationKind === "log-work" ? (
          <BulkWorklogForm
            effectiveCount={effectiveCount}
            worklogDuration={worklogDuration}
            setWorklogDuration={setWorklogDuration}
            isWorklogDurationValid={isWorklogDurationValid}
            worklogStarted={worklogStarted}
            setWorklogStarted={setWorklogStarted}
            worklogComment={worklogComment}
            setWorklogComment={setWorklogComment}
            resetPreview={resetPreview}
          />
        ) : operationKind === "transition" ? (
          <BulkTransitionForm
            effectiveCount={effectiveCount}
            filterProject={filterProject}
            allProjectStatuses={allProjectStatuses}
            targetStatus={targetStatus}
            setTargetStatus={setTargetStatus}
            resetPreview={resetPreview}
          />
        ) : fieldsLoading ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6].map((idx) => (
              <Skeleton key={idx} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <BulkFieldPicker
            availableFieldMap={availableFieldMap}
            enabledFields={enabledFields}
            onToggleField={onToggleField}
          />
        )}

        {filterProject && operationKind === "update-fields" && enabledFields.size > 0 && (
          <BulkFieldInputs
            filterProject={filterProject}
            enabledFields={enabledFields}
            values={values}
            setters={setters}
            resetPreview={resetPreview}
            availableAssignees={availableAssignees}
            labelOptions={labelOptions}
            priorityOptions={priorityOptions}
            versionOptions={versionOptions}
            versionsLoading={versionsLoading}
            availableFieldMap={availableFieldMap}
            isEstimateValid={isEstimateValid}
          />
        )}

        {previewError && <FeedbackBanner tone="destructive">{previewError}</FeedbackBanner>}
      </CardContent>
    </Card>
  );
}
