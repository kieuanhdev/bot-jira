"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import type { UnlinkedBranchItem } from "@/lib/bitbucket/task-delivery-query";
import { GitBranch, Link as LinkIcon, ExternalLink, Clock } from "lucide-react";

type UnlinkedBranchViewProps = {
  items: UnlinkedBranchItem[];
  onLink: (item: UnlinkedBranchItem) => void;
};

export function UnlinkedBranchView({ items, onLink }: UnlinkedBranchViewProps) {
  return (
    <div className="space-y-3">
      <div className="p-3 bg-muted/40 border border-border rounded-xl text-xs text-muted-foreground flex items-center gap-2">
        <GitBranch className="w-4 h-4 shrink-0 text-teal-400" />
        <span>
          Danh sách các nhánh đang hoạt động trên Bitbucket nhưng chưa tìm thấy Jira task tương ứng.
          Gắn mã Jira để đưa nhánh vào tiến độ delivery của task.
        </span>
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          className="p-3.5 rounded-xl border border-border bg-card hover:border-border/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
        >
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded">
                {item.repo}
              </span>
              <span className="font-mono font-semibold text-foreground flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                {item.branch}
              </span>
              {item.prState && (
                <Badge variant="outline" className="text-xs">
                  {item.prState}
                </Badge>
              )}
            </div>
            {item.prTitle && (
              <p className="text-muted-foreground truncate italic">
                PR: &quot;{item.prTitle}&quot;
              </p>
            )}
            {item.lastCommitAt && (
              <div className="text-muted-foreground flex items-center gap-1 text-[11px]">
                <Clock className="w-3 h-3" />
                <span>Commit gần nhất: {timeAgo(item.lastCommitAt)}</span>
                {item.latestCommitSha && (
                  <span className="font-mono opacity-60">({item.latestCommitSha.slice(0, 7)})</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {item.prUrl && (
              <a
                href={item.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 hover:underline flex items-center gap-1 px-2 py-1"
              >
                Xem PR
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => onLink(item)}
              className="gap-1.5 text-xs bg-teal-600 hover:bg-teal-500 text-white cursor-pointer"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Gắn Jira task</span>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
