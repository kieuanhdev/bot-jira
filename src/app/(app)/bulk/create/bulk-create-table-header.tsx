"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { type ColumnId } from "./lib/column-definitions";

interface BulkCreateTableHeaderProps {
  allSelected: boolean;
  onToggleSelectAll: () => void;
  isColVisible: (colId: ColumnId) => boolean;
}

export function BulkCreateTableHeader({
  allSelected,
  onToggleSelectAll,
  isColVisible,
}: BulkCreateTableHeaderProps) {
  return (
    <thead className="sticky top-0 z-20 bg-card/95 backdrop-blur-xs border-b border-border shadow-2xs font-semibold text-muted-foreground select-none">
      <tr>
        {/* Checkbox: sticky left-0 */}
        <th className="sticky left-0 z-30 w-9 bg-card px-2 py-3 text-center border-r border-border/40">
          <Checkbox
            checked={allSelected}
            onCheckedChange={onToggleSelectAll}
            aria-label="Chọn tất cả các dòng"
          />
        </th>

        {/* Index: sticky left-[36px] */}
        <th className="sticky left-9 z-30 w-10 bg-card px-2 py-3 text-center font-mono border-r border-border/40">
          #
        </th>

        {/* Summary: sticky left-[76px] */}
        <th className="sticky left-[76px] z-30 min-w-[280px] w-80 bg-card px-3 py-3 border-r border-border shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between">
            <span>
              Tiêu đề (Summary) <span className="text-destructive">*</span>
            </span>
            <span className="text-[10px] text-muted-foreground font-normal">
              Hỗ trợ paste Excel
            </span>
          </div>
        </th>

        {/* Issue Type */}
        {isColVisible("issueType") && (
          <th className="w-38 px-2.5 py-3 border-r border-border/30">
            Loại task <span className="text-destructive">*</span>
          </th>
        )}

        {/* Parent */}
        {isColVisible("parent") && (
          <th className="w-44 px-2.5 py-3 border-r border-border/30">
            Task cha (Parent)
          </th>
        )}

        {/* Priority */}
        {isColVisible("priority") && (
          <th className="w-32 px-2.5 py-3 border-r border-border/30">
            Mức ưu tiên
          </th>
        )}

        {/* Assignee */}
        {isColVisible("assignee") && (
          <th className="w-40 px-2.5 py-3 border-r border-border/30">
            Người thực hiện
          </th>
        )}

        {/* Components */}
        {isColVisible("components") && (
          <th className="w-40 px-2.5 py-3 border-r border-border/30">
            Hợp phần (Components)
          </th>
        )}

        {/* Labels */}
        {isColVisible("labels") && (
          <th className="w-40 px-2.5 py-3 border-r border-border/30">
            Nhãn (Labels)
          </th>
        )}

        {/* Points */}
        {isColVisible("points") && (
          <th className="w-24 px-2.5 py-3 border-r border-border/30">
            Points
          </th>
        )}

        {/* Original Estimate */}
        {isColVisible("originalEstimate") && (
          <th className="w-28 px-2.5 py-3 border-r border-border/30">
            Ước tính
          </th>
        )}

        {/* Due Date */}
        {isColVisible("dueDate") && (
          <th className="w-34 px-2.5 py-3 border-r border-border/30">
            Hạn chót
          </th>
        )}

        {/* Fix Version */}
        {isColVisible("fixVersion") && (
          <th className="w-36 px-2.5 py-3 border-r border-border/30">
            Phiên bản
          </th>
        )}

        {/* Description */}
        {isColVisible("description") && (
          <th className="w-56 px-2.5 py-3 border-r border-border/30">
            Mô tả (Description)
          </th>
        )}

        {/* Actions: sticky right-0 */}
        <th className="sticky right-0 z-30 w-24 bg-card px-2 py-3 text-center border-l border-border shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.06)]">
          Thao tác
        </th>
      </tr>
    </thead>
  );
}
