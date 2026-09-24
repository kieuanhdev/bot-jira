"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import {
  GitPullRequest,
  ChevronRight,
  User,
  AlertTriangle,
  Link2,
} from "lucide-react";
import type { BranchRowItem } from "./branch-types";

type BranchTableProps = {
  items: BranchRowItem[];
  onSelectBranch: (branch: BranchRowItem) => void;
  onOpenLinkDialog: (branch: BranchRowItem) => void;
};

export function BranchTable({ items, onSelectBranch, onOpenLinkDialog }: BranchTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border bg-muted/50 text-[11px] font-medium text-muted-foreground">
          <tr>
            <th className="py-2.5 pl-4 pr-3">Task & Ngữ cảnh</th>
            <th className="px-3 py-2.5">Nhánh / Kho lưu trữ</th>
            <th className="px-3 py-2.5">Pull Request</th>
            <th className="px-3 py-2.5">Hoạt động</th>
            <th className="px-3 py-2.5">Cần chú ý</th>
            <th className="py-2.5 pl-3 pr-4 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((row) => {
            const hasTask = Boolean(row.task);
            const isSuggested = !row.jiraKey && Boolean(row.suggestedJiraKey);
            const highRiskSignal = row.attentionSignals.find((s) => s.severity === "high");
            const mediumRiskSignal = row.attentionSignals.find((s) => s.severity === "medium");
            const primarySignal = highRiskSignal ?? mediumRiskSignal ?? row.attentionSignals[0];

            return (
              <tr
                key={row.id}
                tabIndex={0}
                role="button"
                onClick={() => onSelectBranch(row)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectBranch(row);
                  }
                }}
                className="group cursor-pointer transition-colors hover:bg-muted/40 focus:bg-muted/50 focus:outline-none"
              >
                {/* 1. Task & Context */}
                <td className="max-w-[260px] py-3 pl-4 pr-3 align-top">
                  {hasTask && row.task ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/issue/${row.task.jiraKey}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono font-semibold text-primary hover:underline"
                        >
                          {row.task.jiraKey}
                        </Link>
                        <Badge
                          variant={
                            row.task.statusCategory === "done"
                              ? "success"
                              : row.task.statusCategory === "indeterminate"
                              ? "info"
                              : "outline"
                          }
                          className="h-4 px-1.5 text-[10px]"
                        >
                          {row.task.status}
                        </Badge>
                      </div>
                      <span className="line-clamp-1 font-medium text-foreground" title={row.task.summary}>
                        {row.task.summary}
                      </span>
                      {row.task.assigneeJira && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>{row.task.assigneeJira}</span>
                        </div>
                      )}
                    </div>
                  ) : isSuggested ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                        <Link2 className="h-3.5 w-3.5" />
                        <span className="font-mono font-semibold">Gợi ý: {row.suggestedJiraKey}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">Ứng viên cần xem xét</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="text-[11px] italic">Chưa gắn task Jira</span>
                    </div>
                  )}
                </td>

                {/* 2. Branch / Repository */}
                <td className="max-w-[240px] px-3 py-3 align-top">
                  <div className="flex flex-col gap-0.5">
                    <span className="truncate font-mono font-medium text-foreground" title={row.branch}>
                      {row.branch}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground" title={row.repo}>
                      {row.repo}
                      {row.prDestinationBranch ? ` → ${row.prDestinationBranch}` : ""}
                    </span>
                  </div>
                </td>

                {/* 3. Pull Request */}
                <td className="px-3 py-3 align-top whitespace-nowrap">
                  {row.prState ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <GitPullRequest className="h-3.5 w-3.5 text-muted-foreground" />
                        {row.prUrl ? (
                          <a
                            href={row.prUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-primary hover:underline"
                          >
                            #{row.prId}
                          </a>
                        ) : (
                          <span className="font-medium text-foreground">#{row.prId}</span>
                        )}
                        <Badge
                          variant={
                            row.prState === "OPEN"
                              ? "info"
                              : row.prState === "MERGED"
                              ? "success"
                              : row.prState === "DECLINED"
                              ? "danger"
                              : "outline"
                          }
                          className="h-4 px-1.5 text-[10px]"
                        >
                          {row.prState === "OPEN"
                            ? "Đang mở"
                            : row.prState === "MERGED"
                            ? "Đã gộp"
                            : row.prState === "DECLINED"
                            ? "Bị từ chối"
                            : row.prState}
                        </Badge>
                      </div>
                      {row.prTitle && (
                        <span className="max-w-[160px] truncate text-[11px] text-muted-foreground" title={row.prTitle}>
                          {row.prTitle}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Không có PR</span>
                  )}
                </td>

                {/* 4. Activity */}
                <td className="px-3 py-3 align-top whitespace-nowrap text-muted-foreground">
                  <div className="flex flex-col gap-0.5">
                    <span>{row.prUpdatedAt ? timeAgo(row.prUpdatedAt) : timeAgo(row.checkedAt)}</span>
                    <span className="text-[10px] text-muted-foreground/80">
                      {row.prUpdatedAt ? "PR cập nhật" : "Đã kiểm tra"}
                    </span>
                  </div>
                </td>

                {/* 5. Attention */}
                <td className="max-w-[180px] px-3 py-3 align-top">
                  {primarySignal && primarySignal.rule !== "unlinked" ? (
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          primarySignal.severity === "high"
                            ? "text-red-500"
                            : primarySignal.severity === "medium"
                            ? "text-amber-500"
                            : "text-sky-500"
                        }`}
                      />
                      <span
                        className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground"
                        title={primarySignal.message}
                      >
                        {primarySignal.message}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/60">—</span>
                  )}
                </td>

                {/* 6. Actions */}
                <td className="py-3 pl-3 pr-4 text-right align-middle whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    {isSuggested && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenLinkDialog(row);
                        }}
                        className="h-7 border-amber-500/30 px-2 text-xs text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                      >
                        Xác nhận
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectBranch(row);
                      }}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      aria-label="Xem chi tiết nhánh"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
