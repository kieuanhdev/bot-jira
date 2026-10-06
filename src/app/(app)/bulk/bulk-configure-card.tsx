"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { Loader2, Eye } from "lucide-react";
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
  // preview
  onPreview: () => void;
  previewing: boolean;
  selectionMode: "pick" | "filter";
  selectedCount: number;
  isActionReady: boolean;
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
  onPreview,
  previewing,
  selectionMode,
  selectedCount,
  isActionReady,
  previewError,
}: BulkConfigureCardProps) {
  return (
    <Card>
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              2
            </span>
            {operationKind === "log-work"
              ? "Thiết lập Ghi Worklog"
              : operationKind === "transition"
                ? "Chuyển trạng thái hàng loạt"
                : "Chọn các trường cần sửa"}
          </span>
          {filterProject && (
            <Badge variant="outline" className="font-normal text-xs">
              Dự án: <span className="font-semibold ml-1">{filterProject}</span>
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {filterProject
            ? operationKind === "log-work"
              ? `Nhập thời lượng thực hiện để ghi nhận cộng dồn lên ${effectiveCount} task đã chọn.`
              : operationKind === "transition"
                ? `Chọn trạng thái đích để chuyển đổi đồng loạt cho ${effectiveCount} task đã chọn trong dự án ${filterProject}.`
                : `Bật một hoặc nhiều trường có sẵn của dự án ${filterProject}, nhập giá trị mới rồi xem trước trên ${effectiveCount} task đã chọn.`
            : "Vui lòng chọn dự án ở Bước 1 trước khi cấu hình thao tác."}
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

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center pt-2">
          <Button
            onClick={onPreview}
            disabled={
              previewing ||
              (selectionMode === "pick" && selectedCount === 0) ||
              !filterProject ||
              !isActionReady
            }
          >
            {previewing ? (
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
            {selectionMode === "filter"
              ? "Xem trước thay đổi bộ lọc"
              : `Xem trước ${selectedCount > 0 ? `${selectedCount} ` : ""}thay đổi`}
          </Button>
          {previewError && (
            <FeedbackBanner tone="destructive">{previewError}</FeedbackBanner>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
