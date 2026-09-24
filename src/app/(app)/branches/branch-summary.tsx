"use client";

import { Card } from "@/components/ui/card";
import { GitBranch, Link2, GitPullRequest, HelpCircle, AlertTriangle } from "lucide-react";
import type { BranchFilterState } from "./branch-types";

type BranchSummaryProps = {
  summary?: {
    active: number;
    linked: number;
    suggested: number;
    unlinked: number;
    openPr: number;
    attention: number;
  };
  filters: BranchFilterState;
  onFilterChange: (patch: Partial<BranchFilterState>) => void;
};

export function BranchSummary({ summary, filters, onFilterChange }: BranchSummaryProps) {
  if (!summary) return null;

  const isAllActive = filters.attention === "0" && filters.link === "ALL" && filters.pr === "ALL";
  const isLinkedActive = filters.link === "linked";
  const isOpenPrActive = filters.pr === "open";
  const isReviewActive = filters.link === "suggested" || filters.link === "unlinked";
  const isAttentionActive = filters.attention === "1";

  const cards = [
    {
      id: "all",
      label: "Tổng số nhánh",
      count: summary.active,
      icon: GitBranch,
      active: isAllActive,
      onClick: () => onFilterChange({ link: "ALL", attention: "0", pr: "ALL", page: 1 }),
      desc: "Đang theo dõi trên Bitbucket",
    },
    {
      id: "linked",
      label: "Đã liên kết",
      count: summary.linked,
      icon: Link2,
      active: isLinkedActive,
      onClick: () => onFilterChange({ link: "linked", attention: "0", page: 1 }),
      desc: "Đã gắn với task Jira",
    },
    {
      id: "open-prs",
      label: "PR đang mở",
      count: summary.openPr,
      icon: GitPullRequest,
      active: isOpenPrActive,
      onClick: () => onFilterChange({ pr: "open", attention: "0", page: 1 }),
      desc: "Đang chờ review / merge",
    },
    {
      id: "review",
      label: "Chưa liên kết",
      count: summary.suggested + summary.unlinked,
      icon: HelpCircle,
      active: isReviewActive,
      onClick: () => onFilterChange({ link: "suggested", attention: "0", page: 1 }),
      desc: `${summary.suggested} nhánh có gợi ý`,
    },
    {
      id: "attention",
      label: "Cần chú ý",
      count: summary.attention,
      icon: AlertTriangle,
      active: isAttentionActive,
      onClick: () => onFilterChange({ attention: "1", page: 1 }),
      desc: "Bất thường nghiệp vụ",
      highlight: summary.attention > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card
            key={c.id}
            role="button"
            tabIndex={0}
            aria-pressed={c.active}
            onClick={c.onClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                c.onClick();
              }
            }}
            className={`cursor-pointer border p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              c.active
                ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                : "border-border bg-card hover:border-border/80"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
              <Icon
                className={`h-4 w-4 ${
                  c.active ? "text-primary" : c.highlight ? "text-amber-500" : "text-muted-foreground"
                }`}
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {c.count.toLocaleString()}
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{c.desc}</p>
          </Card>
        );
      })}
    </div>
  );
}
