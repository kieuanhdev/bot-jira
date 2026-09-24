"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import type { ReviewSuggestionItem } from "@/lib/bitbucket/task-delivery-query";
import {
  Check,
  X,
  Link as LinkIcon,
  ExternalLink,
  GitBranch,
  Clock,
  Sparkles,
  Loader2,
} from "lucide-react";

type ReviewInboxViewProps = {
  items: ReviewSuggestionItem[];
  onConfirm: (branchId: string) => Promise<void>;
  onReject: (branchId: string) => Promise<void>;
  onRelink: (item: ReviewSuggestionItem) => void;
};

export function ReviewInboxView({
  items,
  onConfirm,
  onReject,
  onRelink,
}: ReviewInboxViewProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleConfirm = async (id: string) => {
    setLoadingId(id);
    try {
      await onConfirm(id);
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setLoadingId(id);
    try {
      await onReject(id);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-xl text-xs text-teal-300 flex items-center gap-2">
        <Sparkles className="w-4 h-4 shrink-0 text-teal-400" />
        <span>
          Các branch dưới đây được gợi ý liên kết Jira task tự động dựa trên tiêu đề Pull Request hoặc ghi chú.
          Xác nhận để liên kết chính thức hoặc Từ chối để loại bỏ khỏi danh sách.
        </span>
      </div>

      {items.map((item) => {
        const isLoading = loadingId === item.id;

        return (
          <div
            key={item.id}
            className="p-4 rounded-xl border border-border bg-card hover:border-border/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            {/* Left: Branch & Candidate Info */}
            <div className="space-y-2 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                  {item.repo}
                </span>
                <span className="font-mono text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-teal-400" />
                  {item.branch}
                </span>
                {item.linkConfidence !== null && (
                  <Badge variant="outline" className="text-xs text-teal-400 border-teal-500/30">
                    Độ tin cậy: {item.linkConfidence}%
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {timeAgo(item.checkedAt)}
                </span>
              </div>

              {/* Suggested Task card */}
              <div className="p-3 rounded-lg bg-muted/40 border border-border/60 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Gợi ý liên kết tới:</span>
                    <Link
                      href={`/issue/${item.suggestedJiraKey}`}
                      className="font-mono font-bold text-teal-400 hover:underline flex items-center gap-1 text-sm"
                    >
                      {item.suggestedJiraKey}
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </Link>
                    {item.task?.status && (
                      <Badge variant="secondary" className="text-xs">
                        {item.task.status}
                      </Badge>
                    )}
                  </div>
                  {item.task?.summary && (
                    <p className="text-xs text-foreground/80 font-medium mt-1 truncate">
                      {item.task.summary}
                    </p>
                  )}
                  {item.prTitle && (
                    <p className="text-xs text-muted-foreground mt-1 truncate italic">
                      Từ PR: &quot;{item.prTitle}&quot;
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <Button
                variant="outline"
                size="sm"
                disabled={isLoading}
                onClick={() => onRelink(item)}
                className="gap-1.5 text-xs cursor-pointer hover:bg-muted"
              >
                <LinkIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Đổi task</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={isLoading}
                onClick={() => handleReject(item.id)}
                className="gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/30 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Từ chối</span>
              </Button>

              <Button
                variant="default"
                size="sm"
                disabled={isLoading}
                onClick={() => handleConfirm(item.id)}
                className="gap-1.5 text-xs bg-teal-600 hover:bg-teal-500 text-white cursor-pointer"
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Xác nhận</span>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
