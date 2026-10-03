"use client";

import { useState } from "react";
import {
  type BulkCreateRowInput,
  type BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LabelCombobox } from "./label-combobox";
import { AssigneeCombobox } from "./assignee-combobox";
import { ComponentsCombobox } from "./components-combobox";
import { X, User, Tag, Calendar, Trash2, Eraser, Layers } from "lucide-react";

interface BulkSelectionToolbarProps {
  selectedCount: number;
  totalItems: number;
  metadata: BulkCreateProjectMetadata;
  projectKey: string;
  onApply: (indices: Set<number>, patch: Partial<BulkCreateRowInput>) => void;
  onDelete: (indices: Set<number>) => void;
  onClearOverrides: (indices: Set<number>) => void;
  onClearSelection: () => void;
  selectedIndices: Set<number>;
}

export function BulkSelectionToolbar({
  selectedCount,
  totalItems,
  metadata,
  projectKey,
  onApply,
  onDelete,
  onClearOverrides,
  onClearSelection,
  selectedIndices,
}: BulkSelectionToolbarProps) {
  const [activeAction, setActiveAction] = useState<string | null>(null);

  if (selectedCount === 0) return null;

  function applyField(patch: Partial<BulkCreateRowInput>) {
    onApply(selectedIndices, patch);
    setActiveAction(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
      <Badge variant="info" className="font-mono text-xs">
        {selectedCount} / {totalItems} đã chọn
      </Badge>

      <div className="h-4 w-px bg-border" aria-hidden="true" />

      {/* Assignee */}
      <div className="flex items-center gap-1">
        <User className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        {activeAction === "assignee" ? (
          <div className="w-44">
            <AssigneeCombobox
              projectKey={projectKey}
              value={null}
              onChange={(username) => {
                if (username) applyField({ assignee: username });
              }}
              placeholder="Chọn assignee..."
            />
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActiveAction("assignee")}
            className="h-7 text-xs cursor-pointer"
          >
            Gán assignee
          </Button>
        )}
      </div>

      {/* Components */}
      {metadata.components && metadata.components.length > 0 && (
        <div className="flex items-center gap-1">
          <Layers className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          {activeAction === "components" ? (
            <div className="w-48">
              <ComponentsCombobox
                options={metadata.components}
                value={[]}
                onChange={(componentIds) => {
                  if (componentIds && componentIds.length > 0) {
                    applyField({ componentIds });
                  }
                }}
                placeholder="Chọn hợp phần..."
                compact
              />
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setActiveAction("components")}
              className="h-7 text-xs cursor-pointer"
            >
              Gán hợp phần
            </Button>
          )}
        </div>
      )}

      {/* Priority */}
      <div className="flex items-center gap-1">
        <Select
          value=""
          onValueChange={(val) => {
            if (val) applyField({ priorityId: val });
          }}
        >
          <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs cursor-pointer gap-1">
            <SelectValue placeholder="Ưu tiên" />
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

      {/* Add labels */}
      <div className="flex items-center gap-1">
        <Tag className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        {activeAction === "labels" ? (
          <div className="w-44">
            <LabelCombobox
              projectKey={projectKey}
              value={[]}
              onChange={(labels) => {
                if (labels && labels.length > 0) {
                  applyField({ labels });
                }
              }}
              placeholder="Thêm nhãn..."
              compact
            />
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActiveAction("labels")}
            className="h-7 text-xs cursor-pointer"
          >
            Thêm nhãn
          </Button>
        )}
      </div>

      {/* Due date */}
      <div className="flex items-center gap-1">
        <Calendar className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        {activeAction === "dueDate" ? (
          <input
            type="date"
            className="h-7 rounded-md border border-border bg-background px-2 text-xs"
            onChange={(e) => {
              if (e.target.value) applyField({ dueDate: e.target.value });
            }}
            onBlur={() => setActiveAction(null)}
            autoFocus
          />
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActiveAction("dueDate")}
            className="h-7 text-xs cursor-pointer"
          >
            Hạn chót
          </Button>
        )}
      </div>

      {/* Issue type */}
      <Select
        value=""
        onValueChange={(val) => {
          if (val) {
            const isEpic = metadata.issueTypes.find((t) => t.id === val)?.name.toLowerCase() === "epic";
            const patch: Partial<BulkCreateRowInput> = { issueTypeId: val };
            if (isEpic) patch.parent = null;
            applyField(patch);
          }
        }}
      >
        <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs cursor-pointer gap-1">
          <SelectValue placeholder="Loại task" />
        </SelectTrigger>
        <SelectContent>
          {metadata.issueTypes.map((t) => (
            <SelectItem key={t.id} value={t.id} className="text-xs cursor-pointer">
              {t.subtask ? `⚡ ${t.name}` : t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="h-4 w-px bg-border" aria-hidden="true" />

      {/* Clear overrides */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onClearOverrides(selectedIndices)}
        className="h-7 gap-1 text-xs cursor-pointer text-muted-foreground hover:text-foreground"
      >
        <Eraser className="h-3 w-3" aria-hidden="true" />
        Xoá override
      </Button>

      {/* Delete */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          if (confirm(`Xoá ${selectedCount} dòng đã chọn?`)) {
            onDelete(selectedIndices);
          }
        }}
        className="h-7 gap-1 text-xs cursor-pointer text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3 w-3" aria-hidden="true" />
        Xoá
      </Button>

      <div className="ml-auto">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="h-7 gap-1 text-xs cursor-pointer text-muted-foreground"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Bỏ chọn
        </Button>
      </div>
    </div>
  );
}
