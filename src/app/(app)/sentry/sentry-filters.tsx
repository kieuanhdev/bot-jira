"use client";

import { FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const LEVEL_OPTIONS = [
  { value: "fatal", label: "Fatal" },
  { value: "error", label: "Error" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
] as const;

export const SINCE_OPTIONS = [
  { value: "1h", label: "1 giờ qua" },
  { value: "24h", label: "24 giờ qua" },
  { value: "7d", label: "7 ngày qua" },
] as const;

export type SentryContextFilters = {
  release: string;
  env: string;
  level: string;
  since: string;
};

export const NO_FILTERS: SentryContextFilters = { release: "", env: "", level: "", since: "" };

export type SentryFacetOption = { value: string; count: number };
export type SentryFacets = { releases: SentryFacetOption[]; environments: SentryFacetOption[] };

const ALL = "__all__";

export function countActiveFilters(f: SentryContextFilters): number {
  return [f.release, f.env, f.level, f.since].filter(Boolean).length;
}

interface FilterSelectProps {
  label: string;
  value: string;
  allLabel: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

function FilterSelect({ label, value, allLabel, options, onChange, disabled }: FilterSelectProps) {
  // A filter that came from the URL may not be in the current options; keep it selectable.
  const withCurrent =
    value && !options.some((o) => o.value === value) ? [{ value, label: value }, ...options] : options;
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)} disabled={disabled}>
      <SelectTrigger aria-label={label} className="h-9 w-full min-w-0 sm:w-[170px]">
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {withCurrent.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface SentryFiltersProps {
  filters: SentryContextFilters;
  facets?: SentryFacets;
  onChange: (key: keyof SentryContextFilters, value: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

export function SentryFilters({ filters, facets, onChange, onClear, disabled = false }: SentryFiltersProps) {
  const active = countActiveFilters(filters);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Bộ lọc issue">
      <FilterSelect
        label="Phiên bản phát hành"
        value={filters.release}
        allLabel="Mọi phiên bản"
        options={(facets?.releases ?? []).map((o) => ({ value: o.value, label: `${o.value} (${o.count})` }))}
        onChange={(v) => onChange("release", v)}
        disabled={disabled}
      />
      <FilterSelect
        label="Môi trường"
        value={filters.env}
        allLabel="Mọi môi trường"
        options={(facets?.environments ?? []).map((o) => ({ value: o.value, label: `${o.value} (${o.count})` }))}
        onChange={(v) => onChange("env", v)}
        disabled={disabled}
      />
      <FilterSelect
        label="Mức độ"
        value={filters.level}
        allLabel="Mọi mức độ"
        options={[...LEVEL_OPTIONS]}
        onChange={(v) => onChange("level", v)}
        disabled={disabled}
      />
      <FilterSelect
        label="Lần cuối xảy ra"
        value={filters.since}
        allLabel="Mọi thời điểm"
        options={[...SINCE_OPTIONS]}
        onChange={(v) => onChange("since", v)}
        disabled={disabled}
      />
      {active > 0 && (
        <Button variant="ghost" size="sm" className="cursor-pointer gap-1.5" onClick={onClear}>
          <FilterX className="h-4 w-4" aria-hidden="true" />
          Xóa bộ lọc ({active})
        </Button>
      )}
    </div>
  );
}
