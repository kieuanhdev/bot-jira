"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import type { ReportPeriodPreset, ReportPeriod } from "@/lib/reports/types";
import { getAdjacentPeriod, getPeriodDisplayLabel, resolveReportPeriod } from "@/lib/reports/period";

interface ReportPeriodFilterProps {
  period: ReportPeriod;
  onPeriodChange: (newPeriod: ReportPeriod) => void;
  className?: string;
}

export function ReportPeriodFilter({
  period,
  onPeriodChange,
  className = "",
}: ReportPeriodFilterProps) {
  const handlePresetChange = (preset: string) => {
    if (preset === "custom") {
      onPeriodChange({
        ...period,
        preset: "custom",
      });
      return;
    }
    const resolved = resolveReportPeriod({
      period: preset as ReportPeriodPreset,
      timezone: period.timezone,
    });
    onPeriodChange(resolved.period);
  };

  const handlePrev = () => {
    const adj = getAdjacentPeriod(period, "prev");
    onPeriodChange(adj.period);
  };

  const handleNext = () => {
    const adj = getAdjacentPeriod(period, "next");
    onPeriodChange(adj.period);
  };

  const handleCustomDateChange = (field: "from" | "to", val: string) => {
    onPeriodChange({
      ...period,
      preset: "custom",
      [field]: val,
    });
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const isFutureDisabled = Boolean(
    period.preset === "this_week" ||
    period.preset === "this_month" ||
    (period.to && period.to >= todayIso)
  );

  const isCustomRangeInvalid = Boolean(
    period.preset === "custom" &&
    period.from &&
    period.to &&
    period.from > period.to
  );

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* Preset dropdown */}
      <div className="w-[145px]">
        <Select value={period.preset} onValueChange={handlePresetChange}>
          <SelectTrigger className="h-9 text-xs cursor-pointer">
            <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" aria-hidden="true" />
            <SelectValue placeholder="Chọn kỳ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_week">Tuần này</SelectItem>
            <SelectItem value="last_week">Tuần trước</SelectItem>
            <SelectItem value="this_month">Tháng này</SelectItem>
            <SelectItem value="last_month">Tháng trước</SelectItem>
            <SelectItem value="custom">Tùy chọn khoảng ngày</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Prev / Next buttons */}
      <div className="flex items-center rounded-md border border-border bg-card shadow-2xs">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-8 rounded-none rounded-l-md hover:bg-muted cursor-pointer transition-colors"
          onClick={handlePrev}
          title="Kỳ trước đó"
          aria-label="Kỳ trước đó"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="px-2.5 text-xs font-medium text-foreground whitespace-nowrap border-x border-border select-none">
          {getPeriodDisplayLabel(period)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          disabled={isFutureDisabled}
          className="h-9 w-8 rounded-none rounded-r-md hover:bg-muted cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleNext}
          title={isFutureDisabled ? "Đã ở kỳ mới nhất" : "Kỳ kế tiếp"}
          aria-label={isFutureDisabled ? "Đã ở kỳ mới nhất" : "Kỳ kế tiếp"}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Custom date range inputs */}
      {period.preset === "custom" && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 animate-in fade-in duration-200">
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={period.from}
              max={todayIso}
              onChange={(e) => handleCustomDateChange("from", e.target.value)}
              className={`h-9 w-[130px] text-xs ${isCustomRangeInvalid ? "border-destructive text-destructive" : ""}`}
              aria-label="Từ ngày"
            />
            <span className="text-xs text-muted-foreground">đến</span>
            <Input
              type="date"
              value={period.to}
              max={todayIso}
              onChange={(e) => handleCustomDateChange("to", e.target.value)}
              className={`h-9 w-[130px] text-xs ${isCustomRangeInvalid ? "border-destructive text-destructive" : ""}`}
              aria-label="Đến ngày"
            />
          </div>
          {isCustomRangeInvalid && (
            <span className="text-[11px] text-destructive">
              Ngày bắt đầu phải trước ngày kết thúc
            </span>
          )}
        </div>
      )}
    </div>
  );
}
