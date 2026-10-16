import * as React from "react";
import { useState, useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchField } from "@/components/shared/search-field";
import { FacetMultiSelect } from "@/components/shared/facet-multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  /** Fold the secondary facets (+ `extras`) behind a "Bộ lọc khác" toggle. */
  collapseExtras?: boolean;
  /** Extra controls shown inside the collapsed panel (e.g. quick-filter chips). */
  extras?: React.ReactNode;
  /** Active count contributed by `extras`, shown on the toggle badge. */
  extrasActive?: number;
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
  collapseExtras = false,
  extras,
  extrasActive,
}: IssueFilterBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
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

  const extraFacets = (
    <>
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
    </>
  );
  const extraActiveCount =
    value.roles.length + value.reporters.length + value.approvers.length + value.testers.length +
    value.types.length + value.fixVersions.length + (value.epics?.length ?? 0) + value.labels.length +
    (value.overdue ? 1 : 0) + (extrasActive ?? 0);

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

        {!collapseExtras && extraFacets}
        {collapseExtras && (
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen || extraActiveCount > 0}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
              extraActiveCount > 0 ? "border-primary/40 bg-primary/5 text-foreground" : "border-input bg-background hover:bg-accent/40"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            Bộ lọc khác
            {extraActiveCount > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">{extraActiveCount}</span>
            )}
          </button>
        )}
      </FilterBar>

      {collapseExtras && (moreOpen || extraActiveCount > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-2">
          {extraFacets}
          {extras}
        </div>
      )}

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
