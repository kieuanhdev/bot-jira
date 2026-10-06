import { Check, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { formatJiraDuration } from "@/lib/worklogs/schema";
import { cn } from "@/lib/utils";

interface IssueDetailLogWorkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jiraKey: string;
  timeSpentSeconds?: number | null;
  logTimeSpent: string;
  onLogTimeSpentChange: (value: string) => void;
  logStartedAt: string;
  onLogStartedAtChange: (value: string) => void;
  logComment: string;
  onLogCommentChange: (value: string) => void;
  submitting: boolean;
  worklogError: string | null;
  onSubmit: () => void;
}

export function IssueDetailLogWorkDialog({
  open,
  onOpenChange,
  jiraKey,
  timeSpentSeconds,
  logTimeSpent,
  onLogTimeSpentChange,
  logStartedAt,
  onLogStartedAtChange,
  logComment,
  onLogCommentChange,
  submitting,
  worklogError,
  onSubmit,
}: IssueDetailLogWorkDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            Ghi thời gian (Worklog)
          </DialogTitle>
          <DialogDescription>
            Ghi nhận thời gian thực tế đã làm cho task <span className="font-mono font-semibold text-foreground">{jiraKey}</span> lên Jira.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2 text-sm">
          <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Thời gian đã ghi trên task:</span>
              <span className="font-semibold font-mono">
                {timeSpentSeconds && timeSpentSeconds > 0
                  ? formatJiraDuration(timeSpentSeconds)
                  : "Chưa ghi nhận (0m)"}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground pt-1 border-t">
              * Không thay đổi Remaining Estimate (adjustEstimate = leave).
            </div>
          </div>

          {worklogError && (
            <FeedbackBanner tone="destructive" className="text-xs">
              {worklogError}
            </FeedbackBanner>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Thời lượng <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="Ví dụ: 30m, 2h, 1d 4h..."
              value={logTimeSpent}
              onChange={(e) => onLogTimeSpentChange(e.target.value)}
              disabled={submitting}
              className="h-9 text-sm font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Cú pháp Jira: <strong>m</strong> (phút), <strong>h</strong> (giờ), <strong>d</strong> (ngày = 8h), <strong>w</strong> (tuần = 5d).
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Thời điểm bắt đầu <span className="text-destructive">*</span>
            </label>
            <Input
              type="datetime-local"
              value={logStartedAt}
              onChange={(e) => onLogStartedAtChange(e.target.value)}
              disabled={submitting}
              className="h-9 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Theo giờ địa phương trình duyệt. Không chọn tương lai quá 5 phút.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">Ghi chú (Tùy chọn)</span>
              <span className={cn("text-[11px]", logComment.length > 4000 ? "text-destructive font-semibold" : "text-muted-foreground")}>
                {logComment.length} / 4000
              </span>
            </div>
            <Textarea
              rows={3}
              placeholder="Mô tả công việc đã làm..."
              value={logComment}
              onChange={(e) => onLogCommentChange(e.target.value)}
              disabled={submitting}
              className="text-sm resize-y"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={submitting || !logTimeSpent.trim()}
            onClick={onSubmit}
            className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang ghi...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Ghi worklog
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
