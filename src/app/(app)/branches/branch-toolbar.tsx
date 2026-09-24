"use client";

import { useEffect, useState, useRef } from "react";
import {
  Search,
  X,
  RotateCcw,
  ArrowUpDown,
  Briefcase,
  AlertTriangle,
  Inbox,
  Link2Off,
  GitBranch,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BranchFilterState, CountOption, WorkspaceView } from "./branch-types";

type BranchToolbarProps = {
  filters: BranchFilterState;
  onFilterChange: (patch: Partial<BranchFilterState>) => void;
  onResetFilters: () => void;
  totalResults?: number;
  projectOptions: CountOption[];
  repoOptions: CountOption[];
  counts?: {
    myWork: number;
    needsAttention: number;
    pendingReview: number;
    unlinked: number;
    allBranches: number;
  };
};

export function BranchToolbar({
  filters,
  onFilterChange,
  onResetFilters,
  totalResults,
  projectOptions,
  repoOptions,
  counts,
}: BranchToolbarProps) {
  const [searchInput, setSearchInput] = useState(filters.q);
  const [prevQ, setPrevQ] = useState(filters.q);
  const searchInputRef = useRef<HTMLInputElement>(null);

  if (filters.q !== prevQ) {
    setPrevQ(filters.q);
    setSearchInput(filters.q);
  }

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.q) {
        onFilterChange({ q: searchInput, page: 1 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, filters.q, onFilterChange]);

  // Shortcut key '/' to focus search input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const views: { id: WorkspaceView; label: string; icon: typeof Briefcase; count?: number; highlight?: boolean }[] = [
    {
      id: "my-work",
      label: "Công việc của tôi",
      icon: Briefcase,
      count: counts?.myWork,
    },
    {
      id: "needs-attention",
      label: "Cần xử lý",
      icon: AlertTriangle,
      count: counts?.needsAttention,
      highlight: (counts?.needsAttention ?? 0) > 0,
    },
    {
      id: "pending-review",
      label: "Chờ xác nhận",
      icon: Inbox,
      count: counts?.pendingReview,
      highlight: (counts?.pendingReview ?? 0) > 0,
    },
    {
      id: "unlinked",
      label: "Chưa liên kết",
      icon: Link2Off,
      count: counts?.unlinked,
    },
    {
      id: "all-branches",
      label: "Tất cả branch",
      icon: GitBranch,
      count: counts?.allBranches,
    },
  ];

  const hasActiveFilters =
    filters.q !== "" ||
    filters.project !== "ALL" ||
    filters.repo !== "ALL" ||
    filters.link !== "ALL" ||
    filters.pr !== "ALL" ||
    filters.attention !== "0";

  return (
    <div className="flex flex-col gap-3">
      {/* Workspace View Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/60 border border-border/80 rounded-xl">
        {views.map((tab) => {
          const Icon = tab.icon;
          const isActive = filters.view === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onFilterChange({ view: tab.id, page: 1 })}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                isActive
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isActive
                      ? "bg-white/20 text-white"
                      : tab.highlight
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* Search Input */}
        <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={searchInputRef}
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm kiếm nhánh, task, repo... (/)"
            className="h-9 pl-8 pr-8 text-xs sm:text-sm"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput("");
                onFilterChange({ q: "", page: 1 });
              }}
              aria-label="Xóa tìm kiếm"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Project Select */}
        <select
          value={filters.project}
          onChange={(e) => onFilterChange({ project: e.target.value, page: 1 })}
          aria-label="Lọc theo dự án"
          className="h-9 rounded-md border border-input bg-card px-2.5 py-1 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="ALL">Tất cả dự án</option>
          {projectOptions.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label} ({p.count})
            </option>
          ))}
        </select>

        {/* Repository Select */}
        <select
          value={filters.repo}
          onChange={(e) => onFilterChange({ repo: e.target.value, page: 1 })}
          aria-label="Lọc theo repository"
          className="h-9 max-w-[200px] truncate rounded-md border border-input bg-card px-2.5 py-1 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="ALL">Tất cả repository</option>
          {repoOptions.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        {/* PR State Select (Only if in all-branches or my-work view) */}
        {filters.view !== "pending-review" && filters.view !== "unlinked" && (
          <select
            value={filters.pr}
            onChange={(e) =>
              onFilterChange({
                pr: e.target.value as BranchFilterState["pr"],
                page: 1,
              })
            }
            aria-label="Lọc theo trạng thái PR"
            className="h-9 rounded-md border border-input bg-card px-2.5 py-1 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="ALL">Tất cả trạng thái PR</option>
            <option value="open">PR đang mở (Open)</option>
            <option value="merged">Đã gộp (Merged)</option>
            <option value="declined">Bị từ chối (Declined)</option>
            <option value="closed">Đã đóng (Closed)</option>
            <option value="none">Không có PR</option>
          </select>
        )}

        {/* Technical all-branches extra filters */}
        {filters.view === "all-branches" && (
          <>
            <select
              value={filters.link}
              onChange={(e) =>
                onFilterChange({
                  link: e.target.value as BranchFilterState["link"],
                  page: 1,
                })
              }
              aria-label="Lọc theo trạng thái liên kết task"
              className="h-9 rounded-md border border-input bg-card px-2.5 py-1 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="ALL">Tất cả liên kết</option>
              <option value="linked">Đã liên kết task</option>
              <option value="suggested">Gợi ý ứng viên</option>
              <option value="unlinked">Chưa liên kết</option>
            </select>

            <Button
              variant={filters.attention === "1" ? "default" : "outline"}
              size="sm"
              onClick={() =>
                onFilterChange({
                  attention: filters.attention === "1" ? "0" : "1",
                  page: 1,
                })
              }
              className={`h-9 gap-1.5 text-xs ${
                filters.attention === "1"
                  ? "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Cần chú ý
            </Button>

            <div className="ml-auto flex items-center gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <select
                value={`${filters.sort}_${filters.order}`}
                onChange={(e) => {
                  const [sort, order] = e.target.value.split("_");
                  onFilterChange({
                    sort: sort as BranchFilterState["sort"],
                    order: order as BranchFilterState["order"],
                    page: 1,
                  });
                }}
                aria-label="Sắp xếp danh sách theo"
                className="h-9 rounded-md border border-input bg-card px-2 py-1 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="updated_desc">Mới cập nhật nhất</option>
                <option value="attention_desc">Mức chú ý cao nhất</option>
                <option value="branch_asc">Tên nhánh (A-Z)</option>
                <option value="repo_asc">Repository (A-Z)</option>
                <option value="task_asc">Mã Jira key</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* Active Filter Chips & Result Count */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {totalResults !== undefined && (
            <span className="font-semibold text-foreground">
              {totalResults.toLocaleString()}{" "}
              {filters.view === "all-branches" || filters.view === "unlinked"
                ? "nhánh"
                : "task công việc"}
            </span>
          )}

          {filters.q && (
            <Badge variant="outline" className="gap-1 border-teal-500/40 bg-teal-500/10 text-teal-400">
              Tìm: &quot;{filters.q}&quot;
              <button onClick={() => onFilterChange({ q: "", page: 1 })} aria-label="Xóa tìm kiếm">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filters.project !== "ALL" && (
            <Badge variant="outline" className="gap-1 border-border bg-muted text-foreground">
              Dự án: {filters.project}
              <button onClick={() => onFilterChange({ project: "ALL", page: 1 })} aria-label="Xóa lọc dự án">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filters.repo !== "ALL" && (
            <Badge variant="outline" className="gap-1 border-border bg-muted text-foreground">
              Repo: {filters.repo}
              <button onClick={() => onFilterChange({ repo: "ALL", page: 1 })} aria-label="Xóa lọc repo">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filters.pr !== "ALL" && (
            <Badge variant="outline" className="gap-1 border-border bg-muted text-foreground">
              PR: {filters.pr}
              <button onClick={() => onFilterChange({ pr: "ALL", page: 1 })} aria-label="Xóa lọc PR">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetFilters}
              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
