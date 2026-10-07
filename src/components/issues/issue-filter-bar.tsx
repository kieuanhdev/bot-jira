import * as React from "react";
import { useState, useMemo } from "react";
import { ChevronDown, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchField } from "@/components/shared/search-field";
import { Input } from "@/components/ui/input";
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
  epic?: false | "single" | "multi";
  label?: false | "single" | "multi";
  priority?: false | "single" | "multi";
  role?: false | "multi";
  reporter?: false | "multi";
  approver?: false | "multi";
  tester?: false | "multi";
  type?: false | "multi";
  fixVersion?: false | "multi";
  overdue?: boolean;
  quickSwitch?: boolean;
};

export type FacetOption = string | { value: string; label?: string; count?: number };

export type IssueFilterOptions = {
  assignees?: (string | AssigneeOption)[];
  statuses?: (string | FacetOption)[];
  epics?: (string | FacetOption)[];
  labels?: (string | FacetOption)[];
  priorities?: (string | FacetOption)[];
  reporters?: (string | FacetOption)[];
  approvers?: (string | FacetOption)[];
  testers?: (string | FacetOption)[];
  types?: (string | FacetOption)[];
  fixVersions?: (string | FacetOption)[];
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
  epic: false,
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
  searchable = false,
  searchPlaceholder,
  allowCustom = false,
}: {
  title: string;
  options: (string | FacetOption)[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  allowCustom?: boolean;
}) {
  const [search, setSearch] = useState("");
  const isAll = selected.length === 0;

  const normalizedOptions = useMemo<{ value: string; label: string; count?: number }[]>(() => {
    return options.map((opt) =>
      typeof opt === "string"
        ? { value: opt, label: opt }
        : { value: opt.value, label: opt.label ?? opt.value, count: opt.count }
    );
  }, [options]);

  const toggle = (optVal: string) => {
    if (selected.includes(optVal)) {
      onChange(selected.filter((item) => item !== optVal));
    } else {
      onChange([...selected, optVal]);
    }
  };

  const label = useMemo(() => {
    if (isAll) return `Tất cả ${title.toLowerCase()}`;
    const firstMatch = normalizedOptions.find(
      (o) => o.value.toLowerCase() === selected[0].toLowerCase()
    );
    return firstMatch ? firstMatch.label : selected[0];
  }, [isAll, selected, title, normalizedOptions]);

  const extraCount = Math.max(0, selected.length - 1);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return normalizedOptions;
    const q = search.trim().toLowerCase();
    return normalizedOptions.filter(
      (o) => o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)
    );
  }, [normalizedOptions, search]);

  const canAddCustom = useMemo(() => {
    if (!allowCustom || !search.trim()) return false;
    const q = search.trim().toLowerCase();
    return !normalizedOptions.some((o) => o.value.toLowerCase() === q);
  }, [allowCustom, search, normalizedOptions]);

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

        <DropdownMenuContent align="start" className="w-64 p-1 max-h-72 overflow-y-auto">
          <DropdownMenuLabel className="px-2 py-1 text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
            {title}
          </DropdownMenuLabel>
          {searchable && (
            <div className="p-1 pb-1.5 border-b border-border/50 sticky top-0 bg-popover z-10">
              <div className="relative flex items-center">
                <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder ?? `Tìm ${title.toLowerCase()}…`}
                  className="h-7 text-xs pl-7 pr-2"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}
          <DropdownMenuSeparator className="my-1" />
          {filteredOptions.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <DropdownMenuItem
                key={opt.value}
                onSelect={(e) => {
                  e.preventDefault();
                  toggle(opt.value);
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs"
              >
                <Checkbox checked={checked} className="pointer-events-none" />
                <span className="truncate flex-1">{opt.label}</span>
                {typeof opt.count === "number" && (
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {opt.count}
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
          {canAddCustom && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                const customVal = search.trim().toUpperCase();
                toggle(customVal);
                setSearch("");
              }}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs text-primary font-medium border-t border-border/40 mt-1"
            >
              <span>+ Lọc theo &ldquo;{search.trim().toUpperCase()}&rdquo;</span>
            </DropdownMenuItem>
          )}
          {filteredOptions.length === 0 && !canAddCustom && (
            <div className="py-3 text-center text-xs text-muted-foreground">
              Không có lựa chọn phù hợp
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

function getFacetValue(opt: string | FacetOption): string {
  return typeof opt === "string" ? opt : opt.value;
}

function getFacetLabel(opt: string | FacetOption): string {
  return typeof opt === "string" ? opt : opt.label ?? opt.value;
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
  const showEpic = Boolean(capabilities.epic);
  const showLabel = Boolean(capabilities.label);
  const showPriority = Boolean(capabilities.priority);
  const showQuickSwitch =
    capabilities.quickSwitch !== false &&
    value.assigneeScope.mode === "roster" &&
    value.assigneeScope.roster.length >= 2;

  const statusOptions = options.statuses ?? [];
  const epicOptions = options.epics ?? [];
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

        {capabilities.role && (
          <FacetMultiSelect
            title="Vai trò"
            options={[
              { value: "assignee", label: "Tôi được giao" },
              { value: "reporter", label: "Tôi báo cáo" },
              ...(capabilities.approver ? [{ value: "approver", label: "Tôi là Approver" }] : []),
              { value: "tester", label: "Tôi cần test" },
            ]}
            selected={value.roles}
            onChange={(roles) => onChange({ ...value, roles })}
          />
        )}

        {capabilities.reporter && (
          <FacetMultiSelect title="Reporter" options={options.reporters ?? []} selected={value.reporters} onChange={(reporters) => onChange({ ...value, reporters })} searchable />
        )}
        {capabilities.approver && (
          <FacetMultiSelect title="Approver" options={options.approvers ?? []} selected={value.approvers} onChange={(approvers) => onChange({ ...value, approvers })} searchable />
        )}
        {capabilities.tester && (
          <FacetMultiSelect title="Tester" options={options.testers ?? []} selected={value.testers} onChange={(testers) => onChange({ ...value, testers })} searchable />
        )}
        {capabilities.type && (
          <FacetMultiSelect title="Loại" options={options.types ?? []} selected={value.types} onChange={(types) => onChange({ ...value, types })} />
        )}
        {capabilities.fixVersion && (
          <FacetMultiSelect title="Fix version" options={options.fixVersions ?? []} selected={value.fixVersions} onChange={(fixVersions) => onChange({ ...value, fixVersions })} searchable />
        )}
        {capabilities.overdue && (
          <button
            type="button"
            onClick={() => onChange({ ...value, overdue: !value.overdue })}
            className={cn(
              "h-8 cursor-pointer rounded-md border px-3 text-xs font-medium transition-colors",
              value.overdue ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-input bg-background hover:bg-accent/40"
            )}
            aria-pressed={value.overdue}
          >
            Quá hạn
          </button>
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
                  <SelectItem key={getFacetValue(st)} value={getFacetValue(st)}>
                    {getFacetLabel(st)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}

        {/* Epic Filter */}
        {showEpic &&
          (capabilities.epic === "multi" ? (
            <FacetMultiSelect
              title="Epic"
              options={epicOptions}
              selected={value.epics ?? []}
              onChange={(epics) => onChange({ ...value, epics })}
              searchable={epicOptions.length > 4}
              searchPlaceholder="Tìm mã hoặc tên Epic…"
              allowCustom
            />
          ) : (
            <Select
              value={value.epics?.[0] || "ALL"}
              onValueChange={(v) =>
                onChange({ ...value, epics: v === "ALL" ? [] : [v] })
              }
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Epic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả Epic</SelectItem>
                {epicOptions.map((ep) => (
                  <SelectItem key={getFacetValue(ep)} value={getFacetValue(ep)}>
                    {getFacetLabel(ep)}
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
              searchable={labelOptions.length > 5}
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
                  <SelectItem key={getFacetValue(lb)} value={getFacetValue(lb)}>
                    {getFacetLabel(lb)}
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
                  <SelectItem key={getFacetValue(p)} value={getFacetValue(p)}>
                    {getFacetLabel(p)}
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
