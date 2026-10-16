"use client";

import { useEffect, useState } from "react";
import {
  RotateCcw,
  ArrowUpDown,
  Briefcase,
  AlertTriangle,
  Inbox,
  Link2Off,
  GitBranch,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchField } from "@/components/shared/search-field";
import { FacetSelect } from "@/components/shared/facet-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
        document.getElementById("branches-search-field")?.focus();
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
        <div className="min-w-[240px] flex-1 sm:max-w-xs">
          <SearchField
            id="branches-search-field"
            value={searchInput}
            onChange={(val) => setSearchInput(val)}
            placeholder="Tìm kiếm nhánh, task, repo... (/)"
            ariaLabel="Tìm kiếm nhánh, task, repo"
          />
        </div>

        {/* Project Select */}
        <FacetSelect
          value={filters.project}
          onChange={(project) => onFilterChange({ project, page: 1 })}
          options={projectOptions}
          allLabel="Tất cả dự án"
          allValue="ALL"
          ariaLabel="Lọc theo dự án"
          className="w-[160px]"
        />

        {/* Repository Select */}
        <FacetSelect
          value={filters.repo}
          onChange={(repo) => onFilterChange({ repo, page: 1 })}
          options={repoOptions}
          allLabel="Tất cả repository"
          allValue="ALL"
          ariaLabel="Lọc theo repository"
          className="max-w-[200px]"
        />

        {/* PR State Select (Only if in all-branches or my-work view) */}
        {filters.view !== "pending-review" && filters.view !== "unlinked" && (
          <FacetSelect
            value={filters.pr}
            onChange={(pr) =>
              onFilterChange({
                pr: pr as BranchFilterState["pr"],
                page: 1,
              })
            }
            options={[
              { value: "open", label: "PR đang mở (Open)" },
              { value: "merged", label: "Đã gộp (Merged)" },
              { value: "declined", label: "Bị từ chối (Declined)" },
              { value: "closed", label: "Đã đóng (Closed)" },
              { value: "none", label: "Không có PR" },
            ]}
            allLabel="Tất cả trạng thái PR"
            allValue="ALL"
            ariaLabel="Lọc theo trạng thái PR"
            className="w-[170px]"
          />
        )}

        {/* Technical all-branches extra filters */}
        {filters.view === "all-branches" && (
          <>
            <FacetSelect
              value={filters.link}
              onChange={(link) =>
                onFilterChange({
                  link: link as BranchFilterState["link"],
                  page: 1,
                })
              }
              options={[
                { value: "linked", label: "Đã liên kết task" },
                { value: "suggested", label: "Gợi ý ứng viên" },
                { value: "unlinked", label: "Chưa liên kết" },
              ]}
              allLabel="Tất cả liên kết"
              allValue="ALL"
              ariaLabel="Lọc theo trạng thái liên kết task"
              className="w-[150px]"
            />

            <Button
              variant={filters.attention === "1" ? "default" : "outline"}
              size="sm"
              onClick={() =>
                onFilterChange({
                  attention: filters.attention === "1" ? "0" : "1",
                  page: 1,
                })
              }
              className={`h-9 cursor-pointer gap-1.5 text-xs ${
                filters.attention === "1"
                  ? "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Cần chú ý
            </Button>

            <div className="ml-auto flex items-center gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <Select
                value={`${filters.sort}_${filters.order}`}
                onValueChange={(val) => {
                  const [sort, order] = val.split("_");
                  onFilterChange({
                    sort: sort as BranchFilterState["sort"],
                    order: order as BranchFilterState["order"],
                    page: 1,
                  });
                }}
              >
                <SelectTrigger
                  aria-label="Sắp xếp danh sách theo"
                  className="h-9 w-[165px] cursor-pointer gap-1 px-2.5 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated_desc" className="cursor-pointer text-xs">
                    Mới cập nhật nhất
                  </SelectItem>
                  <SelectItem value="attention_desc" className="cursor-pointer text-xs">
                    Mức chú ý cao nhất
                  </SelectItem>
                  <SelectItem value="branch_asc" className="cursor-pointer text-xs">
                    Tên nhánh (A-Z)
                  </SelectItem>
                  <SelectItem value="repo_asc" className="cursor-pointer text-xs">
                    Repository (A-Z)
                  </SelectItem>
                  <SelectItem value="task_asc" className="cursor-pointer text-xs">
                    Mã Jira key
                  </SelectItem>
                </SelectContent>
              </Select>
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
