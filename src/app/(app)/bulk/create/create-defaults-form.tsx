"use client";

import { useState } from "react";
import { type BulkCreateFieldDefaults, type BulkCreateProjectMetadata } from "@/lib/bulk/create-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { AssigneeCombobox } from "./assignee-combobox";
import { LabelCombobox } from "./label-combobox";
import { ComponentsCombobox } from "./components-combobox";

interface CreateDefaultsFormProps {
  metadata: BulkCreateProjectMetadata;
  projectKey: string;
  defaults: BulkCreateFieldDefaults;
  onChange: (updated: BulkCreateFieldDefaults) => void;
}

export function CreateDefaultsForm({
  metadata,
  projectKey,
  defaults,
  onChange,
}: CreateDefaultsFormProps) {
  const [expanded, setExpanded] = useState(false);

  const activeCount = [
    defaults.issueTypeId,
    defaults.assignee,
    defaults.priorityId,
    defaults.componentIds?.length ? true : null,
    defaults.labels?.length ? true : null,
    defaults.points != null ? true : null,
    defaults.originalEstimate,
    defaults.dueDate,
    defaults.fixVersionIds?.length ? true : null,
    defaults.description,
  ].filter(Boolean).length;

  function updateField<K extends keyof BulkCreateFieldDefaults>(
    key: K,
    val: BulkCreateFieldDefaults[K]
  ) {
    onChange({ ...defaults, [key]: val });
  }

  function handleReset() {
    onChange({});
  }

  return (
    <Card className="border border-border/80 bg-card shadow-sm transition-all duration-200">
      <CardHeader className="cursor-pointer pb-3 select-none" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                Giá trị mặc định cho toàn bộ batch
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Các giá trị được áp dụng tự động cho dòng không chỉ định riêng (có thể ghi đè từng dòng).
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <Badge variant="info" className="px-2 py-0.5 text-xs font-medium">
                {activeCount} trường đã đặt
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 cursor-pointer"
              aria-label={expanded ? "Thu gọn" : "Mở rộng"}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 pt-1 border-t border-border/40">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Issue Type */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">
                Loại công việc mặc định
                {!defaults.issueTypeId && !metadata.defaultIssueTypeId && (
                  <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-normal">
                    (nên đặt)
                  </span>
                )}
              </Label>
              <Select
                value={defaults.issueTypeId || ""}
                onValueChange={(val) => updateField("issueTypeId", val || undefined)}
              >
                <SelectTrigger className={`h-9 text-xs cursor-pointer ${
                  !defaults.issueTypeId && !metadata.defaultIssueTypeId
                    ? "border-amber-500/30"
                    : ""
                }`}>
                  <SelectValue placeholder={
                    metadata.defaultIssueTypeId
                      ? `${metadata.issueTypes.find((t) => t.id === metadata.defaultIssueTypeId)?.name ?? "?"} (Jira mặc định)`
                      : "Chọn loại task..."
                  } />
                </SelectTrigger>
                <SelectContent>
                  {metadata.issueTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs cursor-pointer">
                      {t.subtask ? `⚡ ${t.name}` : t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Mức ưu tiên mặc định</Label>
              <Select
                value={defaults.priorityId || ""}
                onValueChange={(val) => updateField("priorityId", val || undefined)}
              >
                <SelectTrigger className="h-9 text-xs cursor-pointer">
                  <SelectValue placeholder="Chọn ưu tiên..." />
                </SelectTrigger>
                <SelectContent>
                  {metadata.priorityOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs cursor-pointer">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assignee */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Người thực hiện</Label>
              <AssigneeCombobox
                projectKey={projectKey}
                value={defaults.assignee ?? null}
                onChange={(username) => updateField("assignee", username)}
                placeholder="Tìm assignee…"
              />
            </div>

            {/* Components */}
            {metadata.components && metadata.components.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Hợp phần mặc định (Components)</Label>
                <ComponentsCombobox
                  options={metadata.components}
                  value={defaults.componentIds}
                  onChange={(componentIds) => updateField("componentIds", componentIds)}
                  placeholder="Chọn hợp phần mặc định…"
                />
              </div>
            )}

            {/* Labels */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Nhãn</Label>
              <LabelCombobox
                projectKey={projectKey}
                value={defaults.labels}
                onChange={(labels) => updateField("labels", labels)}
                placeholder="vd: frontend, urgent"
              />
            </div>

            {/* Story Points (if supported) */}
            {metadata.pointsFieldId && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Story Points</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="vd: 3"
                  value={defaults.points ?? ""}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    updateField("points", Number.isFinite(v) && v >= 0 ? v : undefined);
                  }}
                  className="h-9 text-xs"
                />
              </div>
            )}

            {/* Original Estimate (if supported) */}
            {metadata.supportsTimeTracking && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Ước tính thời gian</Label>
                <Input
                  placeholder="vd: 1d 4h, 2h, 30m"
                  value={defaults.originalEstimate ?? ""}
                  onChange={(e) => updateField("originalEstimate", e.target.value.trim() || undefined)}
                  className="h-9 text-xs"
                />
              </div>
            )}

            {/* Due Date (if supported) */}
            {metadata.supportsDueDate && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Hạn hoàn thành</Label>
                <Input
                  type="date"
                  value={defaults.dueDate ?? ""}
                  onChange={(e) => updateField("dueDate", e.target.value || undefined)}
                  className="h-9 text-xs"
                />
              </div>
            )}

            {/* Fix Version */}
            {metadata.versionOptions.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Phiên bản phát hành</Label>
                <Select
                  value={defaults.fixVersionIds?.[0] || ""}
                  onValueChange={(val) => updateField("fixVersionIds", val ? [val] : undefined)}
                >
                  <SelectTrigger className="h-9 text-xs cursor-pointer">
                    <SelectValue placeholder="Chọn phiên bản..." />
                  </SelectTrigger>
                  <SelectContent>
                    {metadata.versionOptions
                      .filter((v) => !v.archived)
                      .map((v) => (
                        <SelectItem key={v.id} value={v.id} className="text-xs cursor-pointer">
                          {v.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Mô tả mặc định</Label>
            <Textarea
              placeholder="Mô tả công việc chung áp dụng cho mọi task..."
              rows={2}
              value={defaults.description ?? ""}
              onChange={(e) => updateField("description", e.target.value || undefined)}
              className="resize-y text-xs"
            />
          </div>

          {activeCount > 0 && (
            <div className="flex justify-end pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Xoá tất cả mặc định
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
