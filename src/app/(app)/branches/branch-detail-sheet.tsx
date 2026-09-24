"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { timeAgo } from "@/lib/utils";
import {
  X,
  GitBranch,
  GitPullRequest,
  ExternalLink,
  Copy,
  Check,
  Link2,
  AlertTriangle,
  User,
  Calendar,
} from "lucide-react";
import type { BranchRowItem } from "./branch-types";

type BranchDetailSheetProps = {
  branch: BranchRowItem | null;
  onClose: () => void;
  onOpenLinkDialog: (branch: BranchRowItem) => void;
  onConfirmSuggestion?: (branch: BranchRowItem) => void;
  onUnlinkBranch?: (branch: BranchRowItem) => void;
};

export function BranchDetailSheet({
  branch,
  onClose,
  onOpenLinkDialog,
  onConfirmSuggestion,
  onUnlinkBranch,
}: BranchDetailSheetProps) {
  const [copied, setCopied] = useState(false);

  if (!branch) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(branch.branch);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasTask = Boolean(branch.task);
  const isSuggested = !branch.jiraKey && Boolean(branch.suggestedJiraKey);

  return (
    <DialogPrimitive.Root open={Boolean(branch)} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        {/* Backdrop overlay */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Slide-over Drawer Content */}
        <DialogPrimitive.Content
          aria-describedby="branch-detail-description"
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-lg flex-col gap-0 border-l border-border bg-card p-0 shadow-2xl transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-300 focus:outline-none"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-border p-5">
            <div className="flex flex-col gap-1 pr-6">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" aria-hidden="true" />
                <DialogPrimitive.Title className="font-mono text-base font-bold text-foreground">
                  {branch.branch}
                </DialogPrimitive.Title>
              </div>
              <p id="branch-detail-description" className="text-xs text-muted-foreground">
                {branch.repo}
                {branch.prDestinationBranch ? ` → ${branch.prDestinationBranch}` : ""}
              </p>
            </div>
            <DialogPrimitive.Close
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close drawer</span>
            </DialogPrimitive.Close>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-5 text-sm space-y-6">
            {/* Attention Signals Banner */}
            {branch.attentionSignals.length > 0 && branch.attentionSignals.some((s) => s.rule !== "unlinked") && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tín hiệu quy trình
                </h3>
                <div className="flex flex-col gap-2">
                  {branch.attentionSignals
                    .filter((s) => s.rule !== "unlinked")
                    .map((s, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start gap-2.5 rounded-md border p-3 text-xs ${
                          s.severity === "high"
                            ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                            : s.severity === "medium"
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                        }`}
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <span className="font-semibold capitalize">
                            {s.severity === "high" ? "Nghiêm trọng" : s.severity === "medium" ? "Cảnh báo" : "Thông tin"}
                          </span>
                          : {s.message}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Jira Task Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Ngữ cảnh thực thi Jira
                </h3>
                {hasTask ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenLinkDialog(branch)}
                    className="h-6 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Đổi / Gỡ liên kết
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenLinkDialog(branch)}
                    className="h-6 text-xs border-primary/40 text-primary hover:bg-primary/5"
                  >
                    <Link2 className="mr-1 h-3 w-3" /> Liên kết Jira task
                  </Button>
                )}
              </div>

              {hasTask && branch.task ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/issue/${branch.task.jiraKey}`}
                      className="font-mono text-sm font-bold text-primary hover:underline"
                    >
                      {branch.task.jiraKey}
                    </Link>
                    <Badge
                      variant={
                        branch.task.statusCategory === "done"
                          ? "success"
                          : branch.task.statusCategory === "indeterminate"
                          ? "info"
                          : "outline"
                      }
                    >
                      {branch.task.status}
                    </Badge>
                  </div>
                  <p className="font-medium text-foreground">{branch.task.summary}</p>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      <span>Phụ trách: {branch.task.assigneeJira ?? "Chưa gán"}</span>
                    </div>
                    {branch.task.priority && (
                      <div>
                        <span>Độ ưu tiên: </span>
                        <span className="font-medium text-foreground">{branch.task.priority}</span>
                      </div>
                    )}
                    {branch.task.points != null && (
                      <div>
                        <span>Điểm story: </span>
                        <span className="font-medium text-foreground">{branch.task.points}</span>
                      </div>
                    )}
                    {branch.task.dueDate && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Hạn: {new Date(branch.task.dueDate).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <Button asChild variant="outline" size="sm" className="h-7 w-full text-xs">
                      <Link href={`/issue/${branch.task.jiraKey}`}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Mở task trong ứng dụng
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : isSuggested ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-amber-600 dark:text-amber-400">
                      Ứng viên: {branch.suggestedJiraKey}
                    </span>
                    <Badge variant="warning">Gợi ý</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Suy luận từ {branch.linkSource === "pr_title" ? "tiêu đề Pull Request" : "tên nhánh"}.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (onConfirmSuggestion) {
                        onConfirmSuggestion(branch);
                      } else {
                        onOpenLinkDialog(branch);
                      }
                    }}
                    className="h-8 w-full bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500"
                  >
                    Xác nhận liên kết với {branch.suggestedJiraKey}
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  <p>Chưa có Jira task nào được liên kết với nhánh này.</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Pull Request Section */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pull Request
              </h3>
              {branch.prState ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-foreground">PR #{branch.prId}</span>
                    </div>
                    <Badge
                      variant={
                        branch.prState === "OPEN"
                          ? "info"
                          : branch.prState === "MERGED"
                          ? "success"
                          : branch.prState === "DECLINED"
                          ? "danger"
                          : "outline"
                      }
                    >
                      {branch.prState === "OPEN"
                        ? "Đang mở"
                        : branch.prState === "MERGED"
                        ? "Đã gộp"
                        : branch.prState === "DECLINED"
                        ? "Bị từ chối"
                        : branch.prState}
                    </Badge>
                  </div>

                  {branch.prTitle && <p className="text-xs font-medium text-foreground">{branch.prTitle}</p>}

                  <div className="text-xs text-muted-foreground">
                    <span>Nhánh đích: </span>
                    <span className="font-mono text-foreground">{branch.prDestinationBranch ?? "mặc định"}</span>
                    {branch.prUpdatedAt && (
                      <span className="ml-2 text-muted-foreground/80">
                        (cập nhật {timeAgo(branch.prUpdatedAt)})
                      </span>
                    )}
                  </div>

                  {branch.prUrl && (
                    <div className="pt-1">
                      <Button asChild variant="outline" size="sm" className="h-7 w-full text-xs">
                        <a href={branch.prUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Xem PR trên Bitbucket
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  <p>Không có pull request nào liên kết với nhánh này.</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Provenance & Metadata */}
            <div className="space-y-2 text-xs text-muted-foreground">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Chi tiết nhánh & Nguồn gốc liên kết
              </h3>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/20 p-3">
                <div>
                  <span className="text-muted-foreground">Nguồn liên kết: </span>
                  <span className="font-medium text-foreground capitalize">
                    {branch.linkSource?.replace("_", " ") ?? "không có"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Độ tin cậy: </span>
                  <span className="font-medium text-foreground">
                    {branch.linkConfidence != null ? `${branch.linkConfidence}%` : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Kiểm tra lúc: </span>
                  <span className="text-foreground">{timeAgo(branch.checkedAt)}</span>
                </div>
                {branch.latestCommitSha && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Mã commit: </span>
                    <span className="font-mono text-foreground">{branch.latestCommitSha.slice(0, 10)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sticky Drawer Footer Actions */}
          <div className="flex items-center justify-between border-t border-border bg-card p-4 gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="h-8 gap-1.5 text-xs cursor-pointer">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Đã chép" : "Sao chép tên nhánh"}
            </Button>
            <div className="flex items-center gap-2">
              {branch.jiraKey && onUnlinkBranch && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onUnlinkBranch(branch)}
                  className="h-8 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/30 cursor-pointer"
                >
                  Hủy liên kết
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs cursor-pointer">
                Đóng
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
