"use client";

import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";
import { Sheet } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TaskCreateForm } from "@/components/task-create/task-create-form";
import { FileText } from "lucide-react";

interface TaskDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: BulkCreateRowInput | null;
  defaults: BulkCreateFieldDefaults;
  metadata: BulkCreateProjectMetadata;
  projectKey: string;
  items: BulkCreateRowInput[];
  onChange: (item: BulkCreateRowInput) => void;
}

export function TaskDetailSheet({
  open,
  onOpenChange,
  item,
  defaults,
  metadata,
  projectKey,
  items,
  onChange,
}: TaskDetailSheetProps) {
  if (!item) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Chi tiết task"
      description={item.summary || `Dòng: ${item.clientRef}`}
    >
      <div className="space-y-5">
        <TaskCreateForm
          value={item}
          onChange={onChange}
          metadata={metadata}
          projectKey={projectKey}
          defaults={defaults}
          batchItems={items}
        />

        {/* Client Ref (read-only) */}
        <div className="space-y-1.5 border-t border-border pt-3">
          <Label className="text-xs font-medium text-muted-foreground">Client Ref</Label>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-2xs">
              {item.clientRef}
            </Badge>
            <FileText className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <span className="text-2xs text-muted-foreground">Dùng để tham chiếu parent trong batch</span>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
