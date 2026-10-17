import Link from "next/link";
import { CopyPlus, Flag, GitBranch, Link as LinkIcon, Link2, RefreshCw, Timer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Inline feedback shown under the action bar, optionally linking to a task. */
export type QuickPanelActionMessage = {
  type: "success" | "error";
  text: string;
  href?: string;
  linkLabel?: string;
};

interface QuickPanelActionsProps {
  creatingBranch: boolean;
  onCreateBranch: () => void;
  branchMsg: QuickPanelActionMessage | null;
  cloning: boolean;
  onClone: () => void;
  cloneMsg: QuickPanelActionMessage | null;
  /** Feedback from the other actions (link, worklog, copy...). */
  actionMsg: QuickPanelActionMessage | null;
  flagged: boolean;
  onToggleFlag: () => void;
  onLogWork: () => void;
  onLinkIssue: () => void;
  onDelete: () => void;
  /** Omitted when the Jira URL is unknown. */
  onCopyLink?: () => void;
}

function ActionMessage({ message }: { message: QuickPanelActionMessage | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-2 px-4 py-1.5 text-xs font-medium",
        message.type === "success"
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-destructive/10 text-destructive"
      )}
    >
      <span className="min-w-0 break-words">{message.text}</span>
      {message.href && (
        <Link
          href={message.href}
          className="shrink-0 cursor-pointer underline underline-offset-2 transition-opacity duration-150 hover:opacity-80"
        >
          {message.linkLabel ?? "Mở"}
        </Link>
      )}
    </div>
  );
}

export function QuickPanelActions({
  creatingBranch,
  onCreateBranch,
  branchMsg,
  cloning,
  onClone,
  cloneMsg,
  actionMsg,
  flagged,
  onToggleFlag,
  onLogWork,
  onLinkIssue,
  onDelete,
  onCopyLink,
}: QuickPanelActionsProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 px-4 py-2">
        <Button variant="outline" size="sm" onClick={onLogWork} className="h-7 cursor-pointer gap-1.5 text-xs">
          <Timer className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> Log work
        </Button>
        <Button variant="outline" size="sm" onClick={onLinkIssue} className="h-7 cursor-pointer gap-1.5 text-xs">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> Link issue
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleFlag}
          aria-pressed={flagged}
          className="h-7 cursor-pointer gap-1.5 text-xs"
          title="Thêm/bỏ nhãn Impediment trên Jira (không phải cờ Flagged của Jira)"
        >
          <Flag
            className={flagged ? "h-3.5 w-3.5 text-amber-500" : "h-3.5 w-3.5 text-muted-foreground"}
            aria-hidden="true"
          />
          {flagged ? "Bỏ Impediment" : "Impediment"}
        </Button>
        {onCopyLink && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCopyLink}
            className="h-7 cursor-pointer gap-1.5 text-xs"
            title="Sao chép liên kết Jira"
          >
            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> Copy link
          </Button>
        )}
        {/* Clone Button */}
        <Button
          variant="outline"
          size="sm"
          disabled={cloning}
          onClick={onClone}
          className="h-7 gap-1.5 text-xs cursor-pointer"
          title="Clone task này và liên kết với bản gốc"
        >
          {cloning ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
          ) : (
            <CopyPlus className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          )}
          {cloning ? "Đang clone…" : "Clone"}
        </Button>

        {/* Create Branch Button */}
        <Button
          variant="outline"
          size="sm"
          disabled={creatingBranch}
          onClick={onCreateBranch}
          className="h-7 gap-1.5 text-xs cursor-pointer"
          title="Tạo nhánh Bitbucket theo định dạng chuẩn"
        >
          {creatingBranch ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : (
            <GitBranch className="h-3.5 w-3.5 text-primary" />
          )}
          {creatingBranch ? "Đang tạo…" : "Tạo nhánh Git"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onDelete}
          className="ml-auto h-7 cursor-pointer gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          title="Xóa task trên Jira"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Xóa
        </Button>
      </div>

      <ActionMessage message={branchMsg} />
      <ActionMessage message={cloneMsg} />
      <ActionMessage message={actionMsg} />
    </>
  );
}
