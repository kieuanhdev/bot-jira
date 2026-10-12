"use client";

import { useState } from "react";
import { AlertCircle, RefreshCw, Trash2 } from "lucide-react";
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

type QuickPanelDeleteDialogProps = {
  jiraKey: string;
  summary: string;
  /** The parent mounts this dialog only while open, so the draft starts fresh. */
  open: boolean;
  deleting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/** Deleting is permanent in Jira, so the user must type the task key to confirm. */
export function QuickPanelDeleteDialog({
  jiraKey,
  summary,
  open,
  deleting,
  error,
  onOpenChange,
  onConfirm,
}: QuickPanelDeleteDialogProps) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toUpperCase() === jiraKey.toUpperCase();

  return (
    <Dialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Xóa {jiraKey}
          </DialogTitle>
          <DialogDescription className="line-clamp-2 text-xs">{summary}</DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-3 py-2">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Task sẽ bị xóa vĩnh viễn trên Jira, kèm comment, worklog và file đính kèm. Không thể
            hoàn tác.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="delete-confirm" className="text-xs">
              Nhập <span className="font-mono font-medium text-foreground">{jiraKey}</span> để xác
              nhận
            </Label>
            <Input
              id="delete-confirm"
              value={typed}
              autoFocus
              disabled={deleting}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches && !deleting) onConfirm();
              }}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            Hủy
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting || !matches}
            onClick={onConfirm}
            className="cursor-pointer gap-1.5"
          >
            {deleting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {deleting ? "Đang xóa…" : "Xóa task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
