"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
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
import { useBranchLink, useIssueSearch } from "@/hooks/use-branches";
import { getBitbucketBranchUrl } from "@/lib/utils";
import type { BranchRowItem } from "./branch-types";

type BranchLinkDialogProps = {
  branch: BranchRowItem | null;
  /** When set, links all these branches to the chosen task instead of just `branch`. */
  bulkIds?: string[];
  bitbucketBaseUrl?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

const JIRA_KEY_FORMAT = /^[A-Z][A-Z0-9]+-\d+$/;

/** Turns `feature/add-login-page` or the PR title into plain words for task search. */
function branchSearchHint(branch: BranchRowItem): string {
  const source = branch.prTitle || branch.branch;
  return source
    .replace(/^(feature|feat|bugfix|fix|hotfix|chore|refactor)[/_-]/i, "")
    .replace(/[/_-]+/g, " ")
    .trim()
    .slice(0, 80);
}

export function BranchLinkDialog({
  branch,
  bulkIds,
  bitbucketBaseUrl,
  open,
  onOpenChange,
  onSuccess,
}: BranchLinkDialogProps) {
  const [jiraKeyInput, setJiraKeyInput] = useState(branch?.suggestedJiraKey ?? branch?.jiraKey ?? "");
  const [reasonInput, setReasonInput] = useState("");
  const linkMutation = useBranchLink();

  const typed = jiraKeyInput.trim();
  // With nothing typed, search by words from the branch name / PR title as a hint.
  const hint = branch ? branchSearchHint(branch) : "";
  const searchTerm = typed.length >= 2 ? typed : hint;
  const search = useIssueSearch(searchTerm);
  const results = search.data?.items ?? [];
  const exactPicked = results.some((r) => r.jiraKey === typed.toUpperCase());

  if (!branch) return null;

  const isBulk = Boolean(bulkIds && bulkIds.length > 1);
  const keyValid = JIRA_KEY_FORMAT.test(typed.toUpperCase());

  const gitUrl = getBitbucketBranchUrl(branch.repo, branch.branch, bitbucketBaseUrl, branch.prUrl);
  const error = linkMutation.error ? getErrorMessage(linkMutation.error) : null;

  const handleSave = (unlink = false) => {
    const jiraKey = jiraKeyInput.trim().toUpperCase();
    const reason = reasonInput.trim() || undefined;
    linkMutation.mutate(
      isBulk
        ? { branchId: "bulk", body: { action: "link_many", ids: bulkIds!, jiraKey, reason } }
        : {
            branchId: branch.id,
            body: unlink ? { jiraKey: null } : { jiraKey: jiraKey || null, reason },
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
            {isBulk ? (
              <span className="font-semibold text-foreground">{bulkIds!.length} nhánh đã chọn</span>
            ) : gitUrl ? (
              <>Nhánh:{" "}<a
                href={gitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
                title="Xem trên Git"
              >
                <span>{branch.branch}</span>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a></>
            ) : (
              <span className="font-semibold text-foreground">Nhánh: {branch.branch}</span>
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
              placeholder="Nhập mã hoặc tên task, ví dụ: EPM-3395"
              className="font-mono text-sm uppercase"
              autoComplete="off"
              disabled={linkMutation.isPending}
            />
            {!exactPicked && results.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {typed.length >= 2 ? "Kết quả tìm kiếm" : "Gợi ý theo tên nhánh"}
                </span>
                <ul className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
                  {results.map((r) => (
                    <li key={r.jiraKey}>
                      <button
                        type="button"
                        onClick={() => setJiraKeyInput(r.jiraKey)}
                        disabled={linkMutation.isPending}
                        className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/60"
                      >
                        <span className="font-mono font-semibold text-primary shrink-0">{r.jiraKey}</span>
                        <span className="truncate text-foreground">{r.summary}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{r.status}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {typed.length >= 2 && !search.isFetching && results.length === 0 && (
              <span className="text-[11px] text-muted-foreground">
                Không tìm thấy task nào khớp trong bộ nhớ đệm Jira.
              </span>
            )}
            {typed.length > 0 && !keyValid && (
              <span className={cn("text-[11px] text-muted-foreground")}>
                Chọn một task trong danh sách hoặc nhập đúng mã (ví dụ EPM-3395).
              </span>
            )}
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
          {branch.jiraKey && !isBulk ? (
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
              disabled={linkMutation.isPending || !keyValid}
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
