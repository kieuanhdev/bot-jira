"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo, getBitbucketBranchUrl } from "@/lib/utils";
import type { UnlinkedBranchItem } from "@/lib/bitbucket/task-delivery-query";
import { GitBranch, Link as LinkIcon, ExternalLink, Clock } from "lucide-react";

type UnlinkedBranchViewProps = {
  items: UnlinkedBranchItem[];
  bitbucketBaseUrl?: string | null;
  onLink: (item: UnlinkedBranchItem) => void;
  onLinkMany: (items: UnlinkedBranchItem[]) => void;
};

export function UnlinkedBranchView({ items, bitbucketBaseUrl, onLink, onLinkMany }: UnlinkedBranchViewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Ignore ids that left the list (page change, linked elsewhere).
  const selectedItems = items.filter((i) => selected.has(i.id));
  const allSelected = items.length > 0 && selectedItems.length === items.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="p-3 bg-muted/40 border border-border rounded-xl text-xs text-muted-foreground flex items-center gap-2">
        <GitBranch className="w-4 h-4 shrink-0 text-teal-400" />
        <span>
          Danh sách các nhánh đang hoạt động trên Bitbucket nhưng chưa tìm thấy Jira task tương ứng.
          Gắn mã Jira để đưa nhánh vào tiến độ delivery của task.
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 px-1 text-xs">
        <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))}
            className="h-3.5 w-3.5 cursor-pointer accent-teal-600"
          />
          Chọn tất cả ({items.length})
        </label>
        {selectedItems.length > 0 && (
          <Button
            size="sm"
            onClick={() => onLinkMany(selectedItems)}
            className="gap-1.5 text-xs bg-teal-600 hover:bg-teal-500 text-white cursor-pointer"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Gắn {selectedItems.length} nhánh vào 1 task</span>
          </Button>
        )}
      </div>

      {items.map((item) => {
        const gitUrl = getBitbucketBranchUrl(item.repo, item.branch, bitbucketBaseUrl, item.prUrl);
        return (
          <div
            key={item.id}
            className="p-3.5 rounded-xl border border-border bg-card hover:border-border/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={() => toggle(item.id)}
              aria-label={`Chọn nhánh ${item.branch}`}
              className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-teal-600"
            />
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded">
                  {item.repo}
                </span>
                {gitUrl ? (
                  <a
                    href={gitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-semibold text-foreground hover:text-teal-400 hover:underline flex items-center gap-1.5"
                    title={`Mở nhánh ${item.branch} trên Git`}
                  >
                    <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{item.branch}</span>
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                ) : (
                  <span className="font-mono font-semibold text-foreground flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                    {item.branch}
                  </span>
                )}
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
              {gitUrl && (
                <a
                  href={gitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-teal-400 hover:underline flex items-center gap-1 px-2 py-1"
                  title="Mở nhánh trên Git"
                >
                  Xem Git
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
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
        );
      })}
    </div>
  );
}
