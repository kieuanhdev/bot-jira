"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ArrowRightLeft, CheckCheck } from "lucide-react";
import type { ProjectStatus } from "./lib/bulk-logic";
import { statusDot } from "./lib/bulk-utils";

export interface BulkTransitionFormProps {
  effectiveCount: number;
  filterProject: string;
  allProjectStatuses: ProjectStatus[];
  targetStatus: string;
  setTargetStatus: (value: string) => void;
  resetPreview: () => void;
}

export function BulkTransitionForm({
  effectiveCount,
  filterProject,
  allProjectStatuses,
  targetStatus,
  setTargetStatus,
  resetPreview,
}: BulkTransitionFormProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card/60 p-4">
      <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">
        <div className="font-semibold text-sm mb-1 flex items-center gap-1.5">
          <ArrowRightLeft className="h-4 w-4 text-primary" />
          Chế độ chuyển trạng thái hàng loạt
        </div>
        <p className="text-muted-foreground">
          Chọn trạng thái bạn muốn chuyển đến cho {effectiveCount} task đã chọn trong dự án {filterProject}.
          Jira sẽ kiểm tra luồng workflow transition có hợp lệ với từng task hay không tại bước Xem trước.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          Trạng thái đích <span className="text-destructive">*</span>
        </label>

        {allProjectStatuses.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {allProjectStatuses.map((st) => {
              const isSelected = targetStatus === st.name;
              const dot = statusDot(st.name, st.category);
              return (
                <button
                  key={st.name}
                  type="button"
                  onClick={() => {
                    setTargetStatus(st.name);
                    resetPreview();
                  }}
                  className={cn(
                    "cursor-pointer flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all shadow-2xs",
                    isSelected
                      ? "border-primary bg-primary/15 text-primary ring-2 ring-primary/30 font-semibold"
                      : "border-border bg-background hover:bg-muted/60 text-foreground"
                  )}
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full", dot)} aria-hidden />
                  <span>{st.name}</span>
                  {isSelected && <CheckCheck className="h-3.5 w-3.5 text-primary ml-1" aria-hidden />}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-2 max-w-sm">
          <Select
            value={targetStatus}
            onValueChange={(val) => {
              setTargetStatus(val);
              resetPreview();
            }}
          >
            <SelectTrigger className="h-9 bg-background text-sm">
              <SelectValue placeholder="— Hoặc chọn từ danh sách trạng thái —" />
            </SelectTrigger>
            <SelectContent>
              {allProjectStatuses.map((st) => (
                <SelectItem key={st.name} value={st.name}>
                  <span className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", statusDot(st.name, st.category))} />
                    <span>{st.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!targetStatus && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
            Vui lòng chọn một trạng thái đích để tiếp tục xem trước thay đổi.
          </p>
        )}
      </div>
    </div>
  );
}
