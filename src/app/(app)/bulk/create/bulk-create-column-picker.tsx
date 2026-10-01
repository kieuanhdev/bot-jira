"use client";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Columns3, RotateCcw } from "lucide-react";
import { type ColumnDefinition, type ColumnId } from "./lib/column-definitions";

interface BulkCreateColumnPickerProps {
  toggleableColumns: ColumnDefinition[];
  visibleColumnIds: string[];
  onToggleColumn: (id: ColumnId) => void;
  onResetColumns: () => void;
}

export function BulkCreateColumnPicker({
  toggleableColumns,
  visibleColumnIds,
  onToggleColumn,
  onResetColumns,
}: BulkCreateColumnPickerProps) {
  const visibleCount = toggleableColumns.filter((col) =>
    visibleColumnIds.includes(col.id)
  ).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs cursor-pointer hover:bg-muted/50"
        >
          <Columns3 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span>Cột hiển thị</span>
          <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
            {visibleCount}/{toggleableColumns.length}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 text-xs">
        <DropdownMenuLabel className="text-xs font-semibold text-foreground">
          Tùy chỉnh cột bảng
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="max-h-64 overflow-y-auto space-y-0.5 py-1">
          {toggleableColumns.map((col) => {
            const isChecked = visibleColumnIds.includes(col.id);
            return (
              <DropdownMenuCheckboxItem
                key={col.id}
                checked={isChecked}
                onCheckedChange={() => onToggleColumn(col.id)}
                className="cursor-pointer text-xs"
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            );
          })}
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onResetColumns}
          className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Khôi phục mặc định
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
