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
import type { OperationKind, ProjectStatus } from "./lib/bulk-logic";
import type { BulkVersionOption, ProjectFieldOption } from "./lib/bulk-types";
import type { useBulkFieldState } from "./lib/use-bulk-field-state";

export interface BulkConfigureCardProps {
  filterProject: string;
  operationKind: OperationKind;
  effectiveCount: number;
  onOperationKindChange: (kind: OperationKind) => void;
  // worklog
  worklogDuration: string;
  setWorklogDuration: (val: string) => void;
  isWorklogDurationValid: boolean;
  worklogStarted: string;
  setWorklogStarted: (val: string) => void;
  worklogComment: string;
  setWorklogComment: (val: string) => void;
  // transition
  allProjectStatuses: ProjectStatus[];
  targetStatus: string;
  setTargetStatus: (val: string) => void;
  // fields
  fieldsLoading: boolean;
  availableFieldMap: Map<string, ProjectFieldOption>;
  enabledFields: Set<string>;
  onToggleField: (field: string) => void;
  values: ReturnType<typeof useBulkFieldState>["values"];
  setters: ReturnType<typeof useBulkFieldState>["setters"];
  availableAssignees: string[];
  labelOptions: string[];
  priorityOptions: string[];
  versionOptions: BulkVersionOption[];
  versionsLoading: boolean;
  isEstimateValid: boolean;
  resetPreview: () => void;
  previewError: string | null;
}

export function BulkConfigureCard({
  filterProject,
  operationKind,
  effectiveCount,
  onOperationKindChange,
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
  onToggleField,
  values,
  setters,
  availableAssignees,
  labelOptions,
  priorityOptions,
  versionOptions,
  versionsLoading,
  isEstimateValid,
  resetPreview,
  previewError,
}: BulkConfigureCardProps) {
  return (
    <Card className={effectiveCount === 0 ? "opacity-60" : undefined}>
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="text-base">
          {operationKind === "log-work"
            ? "Ghi worklog"
            : operationKind === "transition"
              ? "Chuyển trạng thái"
              : "Chọn trường cần sửa"}
        </CardTitle>
        <CardDescription>
          {filterProject
            ? operationKind === "log-work"
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

        {filterProject && enabledFields.size > 0 && (
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
