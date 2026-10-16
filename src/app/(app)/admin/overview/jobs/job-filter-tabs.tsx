"use client";

import { SegmentedControl } from "@/components/shared/segmented-control";
import type { JobFilter } from "./use-job-rows";

export interface JobFilterTabsProps {
  filter: JobFilter;
  onChange: (filter: JobFilter) => void;
  counts: {
    all: number;
    failing: number;
    running: number;
    stuck: number;
    never: number;
  };
}

export function JobFilterTabs({ filter, onChange, counts }: JobFilterTabsProps) {
  return (
    <SegmentedControl
      items={[
        { value: "all", label: "Tất cả", count: counts.all },
        { value: "failing", label: "Lỗi", count: counts.failing },
        { value: "running", label: "Đang chạy", count: counts.running },
        { value: "stuck", label: "Treo", count: counts.stuck },
        { value: "never", label: "Chưa chạy", count: counts.never },
      ]}
      value={filter}
      onChange={onChange}
      aria-label="Lọc danh sách job"
    />
  );
}
