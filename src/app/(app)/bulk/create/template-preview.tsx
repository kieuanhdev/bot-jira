"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  GitBranch,
} from "lucide-react";
import { getErrorMessage } from "@/lib/api-client";
import type { BulkCreateProjectMetadata } from "@/lib/bulk/create-types";
import type { BulkCreateTemplateDetailResponse } from "@/lib/contracts/bulk-create-template";

export interface TemplatePreviewProps {
  selectedKey: string;
  template: BulkCreateTemplateDetailResponse["template"] | undefined;
  isTemplateLoading: boolean;
  templateError: unknown;
  metadata: BulkCreateProjectMetadata;
  customSummary: string | null;
  onCustomSummaryChange: (val: string) => void;
  includeParentRow: boolean;
  onIncludeParentRowChange: (val: boolean) => void;
  addedMessage: string | null;
  onBackToList: () => void;
}

export function TemplatePreview({
  selectedKey,
  template,
  isTemplateLoading,
  templateError,
  metadata,
  customSummary,
  onCustomSummaryChange,
  includeParentRow,
  onIncludeParentRowChange,
  addedMessage,
  onBackToList,
}: TemplatePreviewProps) {
  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-center justify-between pb-1 border-b border-border">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBackToList}
          className="h-8 px-2 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Quay lại danh sách task
        </Button>
        <div className="flex items-center gap-1.5">
          <span className="text-2xs text-muted-foreground">Đang xem mẫu:</span>
          <Badge variant="secondary" className="font-mono text-xs font-semibold px-2 py-0.5">
            {selectedKey}
          </Badge>
        </div>
      </div>

      {/* Template Loading State */}
      {isTemplateLoading && (
        <div className="space-y-3 pt-2">
          <Skeleton className="h-5 w-2/3 rounded" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      )}

      {/* Template Error State */}
      {Boolean(templateError) && !isTemplateLoading && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-foreground">Không thể đọc issue {selectedKey}</p>
            <p className="text-muted-foreground">{getErrorMessage(templateError)}</p>
          </div>
        </div>
      )}

      {/* Template Loaded Content */}
      {template && !isTemplateLoading && (
        <div className="space-y-3.5">
          {/* Sub-task & Parent Box */}
          {template.sourceIsSubtask && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 space-y-2.5">
              <div className="flex items-start gap-2">
                <GitBranch className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                    Issue này là Sub-task của task cha:
                    {template.parentKey ? (
                      <Badge variant="outline" className="font-mono font-semibold text-primary border-primary/40">
                        {template.parentKey}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground italic">(Chưa rõ key cha)</span>
                    )}
                  </div>
                  {template.parentSummary && (
                    <p className="text-muted-foreground text-2xs line-clamp-2">
                      {template.parentSummary}
                    </p>
                  )}
                </div>
              </div>

              {template.parentKey && (
                <div className="pt-1.5 border-t border-primary/20">
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs select-none">
                    <input
                      type="checkbox"
                      checked={includeParentRow}
                      onChange={(e) => onIncludeParentRowChange(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <div className="space-y-0.5">
                      <span className="font-semibold text-foreground">
                        Thêm cả task cha ({template.parentKey}) vào danh sách tạo mới
                      </span>
                      <p className="text-2xs text-muted-foreground">
                        {includeParentRow
                          ? "Hệ thống sẽ thêm 2 dòng: task cha mới và sub-task này liên kết với task cha trong cùng batch."
                          : `Chỉ thêm 1 dòng sub-task, tự động gán vào task cha có sẵn ${template.parentKey} trên Jira.`}
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Summary & Mapped Fields Preview */}
          <div className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                Trường được sao chép từ {selectedKey}
              </span>
            </div>

            {/* Editable Summary */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Tiêu đề dòng mới (có thể chỉnh sửa):
              </label>
              <Input
                value={customSummary ?? `${template.summary} (bản sao)`}
                onChange={(e) => onCustomSummaryChange(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Field Badges */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {template.issueTypeName && (
                <Badge variant="outline" className="text-2xs px-2 py-0.5 font-normal">
                  Loại: {template.issueTypeName}
                  {template.issueTypeId && !metadata.issueTypes.some((t) => t.id === template.issueTypeId) && (
                    <span className="ml-1 text-warning">⚠</span>
                  )}
                </Badge>
              )}
              {template.assignee && (
                <Badge variant="outline" className="text-2xs px-2 py-0.5 font-normal">
                  Assignee: {template.assigneeDisplayName || template.assignee}
                </Badge>
              )}
              {template.priorityName && (
                <Badge variant="outline" className="text-2xs px-2 py-0.5 font-normal">
                  Ưu tiên: {template.priorityName}
                </Badge>
              )}
              {template.labels && template.labels.length > 0 && (
                <Badge variant="outline" className="text-2xs px-2 py-0.5 font-normal">
                  {template.labels.length} nhãn
                </Badge>
              )}
              {template.points != null && (
                <Badge variant="outline" className="text-2xs px-2 py-0.5 font-normal">
                  {template.points} pts
                </Badge>
              )}
              {template.originalEstimate && (
                <Badge variant="outline" className="text-2xs px-2 py-0.5 font-normal">
                  Est: {template.originalEstimate}
                </Badge>
              )}
              {template.dueDate && (
                <Badge variant="outline" className="text-2xs px-2 py-0.5 font-normal">
                  Hạn: {template.dueDate}
                </Badge>
              )}
              {template.fixVersionNames && template.fixVersionNames.length > 0 && (
                <Badge variant="outline" className="text-2xs px-2 py-0.5 font-normal">
                  Ver: {template.fixVersionNames.join(", ")}
                </Badge>
              )}
              {template.description && (
                <Badge variant="outline" className="text-2xs px-2 py-0.5 font-normal">
                  Có mô tả
                </Badge>
              )}
            </div>
          </div>

          {/* Skipped fields warnings if any */}
          {template.skippedFields && template.skippedFields.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-1 text-xs">
              <span className="text-2xs font-semibold text-foreground">Trường bỏ qua</span>
              {template.skippedFields.map((sf, i) => (
                <div key={i} className="text-2xs text-muted-foreground">
                  <strong className="text-foreground">{sf.field}:</strong> {sf.reason}
                </div>
              ))}
            </div>
          )}

          {/* Success notification */}
          {addedMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              {addedMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
