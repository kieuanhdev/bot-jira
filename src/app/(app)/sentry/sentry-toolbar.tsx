"use client";

import { useEffect, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { SearchField } from "@/components/shared/search-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SentrySort = "triage" | "hot" | "recent" | "events" | "first";

export interface SentryToolbarProps {
  q: string;
  onSearchChange: (q: string) => void;
  sort: SentrySort;
  onSortChange: (sort: SentrySort) => void;
  isReviewTab: boolean;
  disabled?: boolean;
}

export function SentryToolbar({
  q,
  onSearchChange,
  sort,
  onSortChange,
  isReviewTab,
  disabled = false,
}: SentryToolbarProps) {
  const [searchInput, setSearchInput] = useState(q);
  const [prevQ, setPrevQ] = useState(q);

  if (q !== prevQ) {
    setPrevQ(q);
    setSearchInput(q);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== q) {
        onSearchChange(searchInput);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, q, onSearchChange]);

  const effectiveSort = !isReviewTab && sort === "triage" ? "recent" : sort;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1 sm:max-w-md">
        <SearchField
          id="sentry-search-input"
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Tìm theo tiêu đề hoặc mã lỗi (vd: MOB-1)..."
          ariaLabel="Tìm kiếm lỗi Sentry"
          disabled={disabled}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
          <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Sắp xếp:</span>
        </div>
        <Select
          value={effectiveSort}
          onValueChange={(val) => onSortChange(val as SentrySort)}
          disabled={disabled}
        >
          <SelectTrigger className="w-[180px] h-10 cursor-pointer">
            <SelectValue placeholder="Chọn thứ tự" />
          </SelectTrigger>
          <SelectContent>
            {isReviewTab && (
              <SelectItem value="triage">Ưu tiên xử lý</SelectItem>
            )}
            <SelectItem value="hot">Tăng nóng</SelectItem>
            <SelectItem value="recent">Gần đây nhất</SelectItem>
            <SelectItem value="events">Nhiều sự kiện nhất</SelectItem>
            <SelectItem value="first">Xuất hiện đầu tiên</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
