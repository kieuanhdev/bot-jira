"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertCircle, Link2, Unlink, ExternalLink } from "lucide-react";
import { getErrorMessage } from "@/lib/api-client";
import { useBranchLink } from "@/hooks/use-branches";
import { getBitbucketBranchUrl } from "@/lib/utils";
import type { BranchRowItem } from "./branch-types";

type BranchLinkDialogProps = {
  branch: BranchRowItem | null;
  bitbucketBaseUrl?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function BranchLinkDialog({
  branch,
  bitbucketBaseUrl,
  open,
  onOpenChange,
  onSuccess,
}: BranchLinkDialogProps) {
  const [jiraKeyInput, setJiraKeyInput] = useState(branch?.suggestedJiraKey ?? branch?.jiraKey ?? "");
  const [reasonInput, setReasonInput] = useState("");
  const linkMutation = useBranchLink();

  if (!branch) return null;

  const gitUrl = getBitbucketBranchUrl(branch.repo, branch.branch, bitbucketBaseUrl, branch.prUrl);
  const error = linkMutation.error ? getErrorMessage(linkMutation.error) : null;

  const handleSave = (unlink = false) => {
    linkMutation.mutate(
      {
        branchId: branch.id,
        body: unlink
          ? { jiraKey: null }
          : { jiraKey: jiraKeyInput.trim().toUpperCase() || null, reason: reasonInput.trim() || undefined },
      },
      {
        onSuccess: () => {
          onSuccess();
          onOpenChange(false);
          linkMutation.reset();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Liên kết Jira Task
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Nhánh:{" "}
            {gitUrl ? (
              <a
                href={gitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
                title="Xem trên Git"
              >
                <span>{branch.branch}</span>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            ) : (
              <span className="font-semibold text-foreground">{branch.branch}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jira-key-input" className="text-xs">
              Mã Jira Issue Key
            </Label>
            <Input
              id="jira-key-input"
              value={jiraKeyInput}
              onChange={(e) => setJiraKeyInput(e.target.value.toUpperCase())}
              placeholder="Ví dụ: EPM-3395"
              className="font-mono text-sm uppercase"
              disabled={linkMutation.isPending}
            />
            <span className="text-[11px] text-muted-foreground">
              Mã task phải tồn tại trong bộ nhớ đệm Jira.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason-input" className="text-xs">
              Lý do / Ghi chú (tùy chọn)
            </Label>
            <Input
              id="reason-input"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="Ví dụ: điều chỉnh liên kết thủ công"
              className="text-xs"
              disabled={linkMutation.isPending}
            />
          </div>
        </div>

        <DialogFooter className="flex flex-row items-center justify-between sm:justify-between">
          {branch.jiraKey ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={linkMutation.isPending}
              onClick={() => handleSave(true)}
              className="border-red-500/30 text-red-600 hover:bg-red-500/10 dark:text-red-400"
            >
              <Unlink className="mr-1 h-3.5 w-3.5" /> Gỡ liên kết
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={linkMutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={linkMutation.isPending || !jiraKeyInput.trim()}
              onClick={() => handleSave(false)}
            >
              {linkMutation.isPending ? "Đang lưu..." : "Lưu liên kết"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
