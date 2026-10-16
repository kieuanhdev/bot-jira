"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { ProjectFieldOption } from "./lib/bulk-types";

export interface BulkFieldPickerProps {
  availableFieldMap: Map<string, ProjectFieldOption>;
  enabledFields: Set<string>;
  onToggleField: (field: string) => void;
}

export function BulkFieldPicker({
  availableFieldMap,
  enabledFields,
  onToggleField,
}: BulkFieldPickerProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { id: "assignee", label: "Người phụ trách" },
        { id: "labels", label: "Nhãn" },
        { id: "priority", label: "Độ ưu tiên" },
        { id: "issueType", label: "Type" },
        { id: "points", label: "Story/Task Points" },
        { id: "estimate", label: "Original Estimate" },
        { id: "dueDate", label: "Due date" },
        { id: "fixVersions", label: "Fix Versions" },
        { id: "epic", label: "Epic / Task cha" },
        { id: "reporter", label: "Reporter" },
        { id: "approver", label: "Approver" },
        { id: "tester", label: "Tester" },
      ].map(({ id, label }) => {
        const isAvailable = availableFieldMap.get(id)?.available ?? true;
        const isEnabled = enabledFields.has(id);
        return (
          <label
            key={id}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
              !isAvailable && "opacity-60 cursor-not-allowed bg-muted/20 border-dashed",
              isAvailable && isEnabled && "border-primary bg-primary/10 text-primary font-medium",
              isAvailable && !isEnabled && "hover:bg-muted/50"
            )}
          >
            <div className="flex items-center gap-2">
              <Checkbox
                checked={isEnabled && isAvailable}
                disabled={!isAvailable}
                onCheckedChange={() => isAvailable && onToggleField(id)}
              />
              <span>{label}</span>
            </div>
            {!isAvailable && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal">
                Không khả dụng
              </Badge>
            )}
          </label>
        );
      })}
    </div>
  );
}
