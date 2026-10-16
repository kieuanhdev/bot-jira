"use client";

import { useState } from "react";
import { CopyPlus, Info, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { cloneSummary } from "@/lib/issues/clone";

const MAX_SUMMARY_LENGTH = 255;

type QuickPanelCloneDialogProps = {
  jiraKey: string;
  summary: string;
  /** The parent mounts this dialog only while open, so the draft starts fresh. */
  open: boolean;
  cloning: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (summary: string) => void;
};

/** Jira-style clone dialog: confirm the copy's summary, then create and link it. */
export function QuickPanelCloneDialog({
  jiraKey,
  summary,
  open,
  cloning,
  error,
  onOpenChange,
  onConfirm,
}: QuickPanelCloneDialogProps) {
  const [draft, setDraft] = useState(() => cloneSummary(summary));

  const trimmed = draft.trim();
  const invalid = trimmed.length === 0 || trimmed.length > MAX_SUMMARY_LENGTH;

  return (
    <Dialog open={open} onOpenChange={(next) => !cloning && onOpenChange(next)}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CopyPlus className="h-4 w-4 text-primary" aria-hidden="true" />
            Clone {jiraKey}
          </DialogTitle>
          <DialogDescription className="line-clamp-1 text-xs">{summary}</DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-3 py-2">
          {error && (
            <FeedbackBanner tone="destructive" className="text-xs">
              <span className="min-w-0 break-words">{error}</span>
            </FeedbackBanner>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clone-summary" className="text-xs">
              Tiêu đề bản sao
            </Label>
            <Input
              id="clone-summary"
              value={draft}
              autoFocus
              disabled={cloning}
              maxLength={MAX_SUMMARY_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !invalid && !cloning) onConfirm(trimmed);
              }}
              className="text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              {trimmed.length}/{MAX_SUMMARY_LENGTH} ký tự
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-md border bg-muted/20 p-2.5">
            <Info className="mt-px h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 text-[11px] text-muted-foreground">
              <p>
                Bản sao giữ mô tả, loại task, độ ưu tiên, nhãn, component, fix version, người thực
                hiện, hạn hoàn thành, reporter/approver/tester, epic link, story points và các
                trường bắt buộc của màn hình tạo task.
              </p>
              <p className="mt-1">
                Không sao chép: trạng thái, comment, file đính kèm, worklog, người theo dõi và
                sprint. Bản sao được nối với {jiraKey} bằng issue link (kiểu{" "}
                <span className="font-medium text-foreground">Cloners</span> nếu Jira có, nếu không
                thì <span className="font-medium text-foreground">Relates</span>).
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={cloning}
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            Hủy
          </Button>
          <Button
            size="sm"
            disabled={cloning || invalid}
            onClick={() => onConfirm(trimmed)}
            className="cursor-pointer gap-1.5"
          >
            {cloning ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <CopyPlus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {cloning ? "Đang clone…" : "Clone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
