"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatJiraDuration, parseJiraDuration } from "@/lib/worklogs/schema";
import { Clock } from "lucide-react";

export interface BulkWorklogFormProps {
  effectiveCount: number;
  worklogDuration: string;
  setWorklogDuration: (value: string) => void;
  isWorklogDurationValid: boolean;
  worklogStarted: string;
  setWorklogStarted: (value: string) => void;
  worklogComment: string;
  setWorklogComment: (value: string) => void;
  resetPreview: () => void;
}

export function BulkWorklogForm({
  effectiveCount,
  worklogDuration,
  setWorklogDuration,
  isWorklogDurationValid,
  worklogStarted,
  setWorklogStarted,
  worklogComment,
  setWorklogComment,
  resetPreview,
}: BulkWorklogFormProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card/60 p-4">
      <div className="rounded-lg border border-primary/30 bg-primary-soft/40 p-3 text-xs text-foreground">
        <div className="font-semibold text-sm mb-1 flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-primary" />
          Chế độ Ghi Worklog hàng loạt
        </div>
        <div>
          Mỗi task đã chọn ({effectiveCount} task) sẽ được cộng thêm thời lượng này vào thời gian đã ghi trên Jira.
          {isWorklogDurationValid && (
            <div className="mt-1 font-semibold text-foreground">
              Tổng thời gian dự kiến ghi nhận: {effectiveCount} × {worklogDuration} ={" "}
              {formatJiraDuration(effectiveCount * (parseJiraDuration(worklogDuration) ?? 0))}
            </div>
          )}
        </div>
        <div className="mt-1 text-muted-foreground text-2xs">
          * Không thay đổi Remaining Estimate (adjustEstimate = leave).
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground">
            Thời lượng mỗi task <span className="text-destructive">*</span>
          </label>
          <Input
            placeholder="Ví dụ: 30m, 2h, 1d 4h..."
            value={worklogDuration}
            onChange={(e) => {
              setWorklogDuration(e.target.value);
              resetPreview();
            }}
            className={cn(
              "h-9 text-sm font-mono",
              worklogDuration.trim() && !isWorklogDurationValid && "border-destructive focus-visible:ring-destructive"
            )}
          />
          <p className="text-2xs text-muted-foreground">
            Cú pháp Jira: <strong>m</strong> (phút), <strong>h</strong> (giờ), <strong>d</strong> (ngày = 8h), <strong>w</strong> (tuần = 5d).
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground">
            Thời điểm bắt đầu <span className="text-destructive">*</span>
          </label>
          <Input
            type="datetime-local"
            value={worklogStarted}
            onChange={(e) => {
              setWorklogStarted(e.target.value);
              resetPreview();
            }}
            className="h-9 text-sm"
          />
          <p className="text-2xs text-muted-foreground">
            Thời điểm ghi nhận theo giờ địa phương.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">Ghi chú (Tùy chọn)</span>
          <span className={cn("text-2xs", worklogComment.length > 4000 ? "text-destructive font-semibold" : "text-muted-foreground")}>
            {worklogComment.length} / 4000
          </span>
        </div>
        <Textarea
          rows={2}
          placeholder="Mô tả công việc chung cho các task này..."
          value={worklogComment}
          onChange={(e) => {
            setWorklogComment(e.target.value);
            resetPreview();
          }}
          className="text-sm resize-y"
        />
      </div>
    </div>
  );
}
