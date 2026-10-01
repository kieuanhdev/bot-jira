"use client";

import * as React from "react";
import { useMemo } from "react";
import { Filter, Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchField } from "@/components/shared/search-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  type IssueFilters,
  countActiveIssueFilters,
} from "@/lib/issues/issue-filters";
import { AssigneeFilter, type AssigneeOption } from "./assignee-filter";
import { AssigneeQuickSwitch } from "./assignee-quick-switch";

export type IssueFilterCapabilities = {
  search?: boolean;
  assignee?: false | "single" | "multi";
  status?: false | "single" | "multi";
  label?: false | "single" | "multi";
  priority?: false | "single" | "multi";
  quickSwitch?: boolean;
};

export type IssueFilterOptions = {
  assignees?: (string | AssigneeOption)[];
  statuses?: string[];
  labels?: string[];
  priorities?: string[];
};

export interface IssueFilterBarProps {
  value: IssueFilters;
  defaults: IssueFilters;
  options?: IssueFilterOptions;
  capabilities?: IssueFilterCapabilities;
  onChange: (value: IssueFilters) => void;
  onReset?: () => void;
  myName?: string | null;
  searchPlaceholder?: string;
  className?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}

const DEFAULT_CAPABILITIES: IssueFilterCapabilities = {
  search: true,
  assignee: "multi",
  status: false,
  label: "single",
  priority: "single",
  quickSwitch: true,
};

function FacetMultiSelect({
  title,
  options,
  selected,
  onChange,
  className,
}: {
  title: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  const isAll = selected.length === 0;

  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((item) => item !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  const label = useMemo(() => {
    if (isAll) return `Tất cả ${title.toLowerCase()}`;
    if (selected.length === 1) return selected[0];
    return selected[0];
  }, [isAll, selected, title]);

  const extraCount = Math.max(0, selected.length - 1);

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-input bg-background shadow-xs text-xs sm:text-sm transition-colors",
        !isAll && "border-primary/40 bg-primary/5",
        className
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-8 items-center gap-1.5 px-2.5 min-w-[130px] max-w-[200px] text-left cursor-pointer hover:bg-accent/40 rounded-l-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors",
              isAll && "rounded-r-md"
            )}
          >
            <span
              className={cn(
                "truncate flex-1 font-normal",
                !isAll && "font-medium text-foreground"
              )}
            >
              {label}
            </span>
            {extraCount > 0 && (
              <Badge
                variant="secondary"
                className="h-4 px-1 text-[10px] font-semibold bg-primary/15 text-primary rounded-full shrink-0"
              >
                +{extraCount}
              </Badge>
            )}
            <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-0.5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-56 p-1 max-h-60 overflow-y-auto">
          <DropdownMenuLabel className="px-2 py-1 text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
            {title}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="my-1" />
          {options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <DropdownMenuItem
                key={opt}
                onSelect={(e) => {
                  e.preventDefault();
                  toggle(opt);
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs"
              >
                <Checkbox checked={checked} className="pointer-events-none" />
                <span className="truncate flex-1">{opt}</span>
              </DropdownMenuItem>
            );
          })}
          {options.length === 0 && (
            <div className="py-3 text-center text-xs text-muted-foreground">
              Không có lựa chọn
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {!isAll && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange([]);
          }}
          aria-label={`Bỏ lọc ${title.toLowerCase()}`}
          title={`Bỏ lọc ${title.toLowerCase()}`}
          className="flex h-8 w-6 items-center justify-center border-l border-input/60 rounded-r-md text-muted-foreground hover:text-foreground hover:bg-accent/40 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors shrink-0"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function IssueFilterBar({
  value,
  defaults,
  options = {},
  capabilities = DEFAULT_CAPABILITIES,
  onChange,
  onReset,
  myName,
  searchPlaceholder,
  className,
  children,
  actions,
}: IssueFilterBarProps) {
  const activeCount = useMemo(
    () => countActiveIssueFilters(value, defaults),
    [value, defaults]
  );

  const handleReset = () => {
    if (onReset) {
      onReset();
    } else {
      onChange(defaults);
    }
  };

  const showSearch = capabilities.search !== false;
  const showAssignee = capabilities.assignee !== false;
  const showStatus = Boolean(capabilities.status);
  const showLabel = Boolean(capabilities.label);
  const showPriority = Boolean(capabilities.priority);
  const showQuickSwitch =
    capabilities.quickSwitch !== false &&
    value.assigneeScope.mode === "roster" &&
    value.assigneeScope.roster.length >= 2;

  const statusOptions = options.statuses ?? [];
  const labelOptions = options.labels ?? [];
  const priorityOptions = options.priorities ?? [
    "Low",
    "Medium",
    "High",
    "Highest",
    "Blocker",
  ];

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <FilterBar activeCount={activeCount} onReset={handleReset} actions={actions}>
        {showSearch && (
          <SearchField
            value={value.query}
            onChange={(q) => onChange({ ...value, query: q })}
            placeholder={searchPlaceholder ?? "Tìm kiếm mã Jira, tiêu đề…"}
            ariaLabel="Tìm kiếm task"
            className="flex-1 min-w-[200px]"
          />
        )}

        {showAssignee && (
          <AssigneeFilter
            value={value.assigneeScope}
            onChange={(assigneeScope) => onChange({ ...value, assigneeScope })}
            options={options.assignees ?? []}
            myName={myName}
            defaultScope={defaults.assigneeScope}
            clearTarget="all"
          />
        )}

        {/* Custom page-specific children inserted right after core filters */}
        {children}

        {/* Status Filter */}
        {showStatus &&
          (capabilities.status === "multi" ? (
            <FacetMultiSelect
              title="Trạng thái"
              options={statusOptions}
              selected={value.statuses}
              onChange={(statuses) => onChange({ ...value, statuses })}
            />
          ) : (
            <Select
              value={value.statuses[0] || "ALL"}
              onValueChange={(v) =>
                onChange({ ...value, statuses: v === "ALL" ? [] : [v] })
              }
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
                {statusOptions.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}

        {/* Label Filter */}
        {showLabel &&
          (capabilities.label === "multi" ? (
            <FacetMultiSelect
              title="Nhãn"
              options={labelOptions}
              selected={value.labels}
              onChange={(labels) => onChange({ ...value, labels })}
            />
          ) : (
            <Select
              value={value.labels[0] || "ALL"}
              onValueChange={(v) =>
                onChange({ ...value, labels: v === "ALL" ? [] : [v] })
              }
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Nhãn" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả nhãn</SelectItem>
                {labelOptions.map((lb) => (
                  <SelectItem key={lb} value={lb}>
                    {lb}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}

        {/* Priority Filter */}
        {showPriority &&
          (capabilities.priority === "multi" ? (
            <FacetMultiSelect
              title="Độ ưu tiên"
              options={priorityOptions}
              selected={value.priorities}
              onChange={(priorities) => onChange({ ...value, priorities })}
            />
          ) : (
            <Select
              value={value.priorities[0] || "ALL"}
              onValueChange={(v) =>
                onChange({ ...value, priorities: v === "ALL" ? [] : [v] })
              }
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Độ ưu tiên" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả độ ưu tiên</SelectItem>
                {priorityOptions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
      </FilterBar>

      {/* Quick Switch for multi-selected roster */}
      {showQuickSwitch && (
        <AssigneeQuickSwitch
          value={value.assigneeScope}
          onChange={(assigneeScope) => onChange({ ...value, assigneeScope })}
          myName={myName}
        />
      )}
    </div>
  );
}
