"use client";

import React from "react";
import { CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BulkCreatePreviewResult } from "@/lib/bulk/create-types";

export interface BulkCreateStepperProps {
  step: "input" | "preview" | "progress";
  onStepChange: (step: "input" | "preview") => void;
  filledCount: number;
  previewData?: BulkCreatePreviewResult | null;
  activeOperationId?: string | null;
}

export function BulkCreateStepper({
  step,
  onStepChange,
  filledCount,
  previewData,
  activeOperationId,
}: BulkCreateStepperProps) {
  const stepsConfig = [
    {
      number: 1,
      title: "Nhập dữ liệu & Mặc định",
      desc: filledCount > 0 ? `${filledCount} task đã sẵn sàng` : "Nhập hoặc dán từ bảng tính",
      active: step === "input",
      done: step !== "input",
      clickable: step === "preview",
      onClick: () => {
        if (step === "preview") onStepChange("input");
      },
    },
    {
      number: 2,
      title: "Xem trước & Xác nhận",
      desc: previewData ? `${previewData.actionable} task sẵn sàng tạo` : "Kiểm tra chuẩn hoá",
      active: step === "preview",
      done: step === "progress",
      clickable: step === "input" && Boolean(previewData),
      onClick: () => {
        if (step === "input" && previewData) onStepChange("preview");
      },
    },
    {
      number: 3,
      title: "Tiến độ & Kết quả",
      desc: activeOperationId ? "Hàng đợi nền Jira" : "Tạo tự động trên Jira",
      active: step === "progress",
      done: false,
      clickable: false,
      onClick: undefined,
    },
  ];

  return (
    <ol
      aria-label="Tiến trình tạo task hàng loạt"
      className="grid grid-cols-1 sm:grid-cols-3 overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs select-none divide-y sm:divide-y-0 sm:divide-x divide-border/60"
    >
      {stepsConfig.map((s) => {
        const Tag = s.clickable ? "button" : "div";
        return (
          <li key={s.number}>
            <Tag
              type={s.clickable ? "button" : undefined}
              onClick={s.onClick}
              disabled={!s.clickable}
              className={cn(
                "w-full text-left flex items-center gap-3 px-4 py-3.5 transition-colors",
                s.active && "bg-primary/5 text-foreground font-medium",
                !s.active && !s.done && "text-muted-foreground",
                s.done && "text-foreground",
                s.clickable && "cursor-pointer hover:bg-muted/40"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-transform duration-150",
                  s.done
                    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : s.active
                      ? "border-primary bg-primary text-primary-foreground shadow-xs scale-105"
                      : "border-border bg-muted/60 text-muted-foreground"
                )}
              >
                {s.done ? <CheckCheck className="h-4 w-4" aria-hidden="true" /> : s.number}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs sm:text-sm font-semibold">{s.title}</span>
                  {s.clickable && (
                    <span className="text-[10px] text-primary underline">Quay lại</span>
                  )}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">{s.desc}</div>
              </div>
            </Tag>
          </li>
        );
      })}
    </ol>
  );
}
