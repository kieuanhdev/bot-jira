"use client";

import React, { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Maximize2,
  Minimize2,
  Columns,
  Square,
  ListChecks,
  Code,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_DESCRIPTION_LENGTH } from "@/lib/bulk/create-types";

export interface DescriptionEditorProps {
  value?: string;
  onChange: (value?: string) => void;
  defaultDescription?: string;
  isLargeHeight?: boolean;
  onToggleHeight?: () => void;
  isFullWidth?: boolean;
  onToggleFullWidth?: () => void;
  showLayoutToggles?: boolean;
  className?: string;
}

export function DescriptionEditor({
  value,
  onChange,
  defaultDescription,
  isLargeHeight: controlledIsLarge,
  onToggleHeight,
  isFullWidth,
  onToggleFullWidth,
  showLayoutToggles = true,
  className,
}: DescriptionEditorProps) {
  const [internalLargeHeight, setInternalLargeHeight] = useState(false);
  const isLarge = controlledIsLarge ?? internalLargeHeight;
  const toggleHeight = onToggleHeight ?? (() => setInternalLargeHeight((prev) => !prev));

  const descLength = value?.length ?? 0;

  function insertTemplate(templateText: string) {
    const current = value || "";
    const updated = current ? `${current}\n\n${templateText}` : templateText;
    onChange(updated);
  }

  function handleInsertAcTemplate() {
    insertTemplate(
`*Mục tiêu:* 

*Tiêu chí nghiệm thu (Acceptance Criteria):*
- [ ] 
- [ ] 

*Tài liệu tham khảo & Ghi chú:*
`
    );
  }

  function handleInsertCodeBlock() {
    insertTemplate(
`{code:typescript}
// Mã nguồn hoặc log lỗi ở đây
{code}`
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>Mô tả chi tiết công việc (Description)</span>
        </Label>

        {/* Description Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleInsertAcTemplate}
            title="Chèn khung Tiêu chí nghiệm thu (Acceptance Criteria)"
            className="h-6 px-2 text-[11px] gap-1 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <ListChecks className="h-3 w-3 text-primary" aria-hidden="true" />
            <span className="hidden sm:inline">Khung</span> AC
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleInsertCodeBlock}
            title="Chèn khối mã nguồn {code}"
            className="h-6 px-2 text-[11px] gap-1 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Code className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <span>Code</span>
          </Button>

          {showLayoutToggles && (
            <>
              <div className="h-3.5 w-px bg-border/80 hidden sm:block" aria-hidden="true" />

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleHeight}
                title={isLarge ? "Thu nhỏ chiều cao khung nhập" : "Mở rộng chiều cao khung nhập"}
                className="h-6 px-2 text-[11px] gap-1 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                {isLarge ? (
                  <>
                    <Minimize2 className="h-3 w-3" aria-hidden="true" />
                    <span>Thu cao</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3 w-3" aria-hidden="true" />
                    <span>Cao hơn</span>
                  </>
                )}
              </Button>

              {onToggleFullWidth && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onToggleFullWidth}
                  title={isFullWidth ? "Chuyển về chia 2 cột" : "Mở rộng mô tả toàn chiều rộng"}
                  className="h-6 px-2 text-[11px] gap-1 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  {isFullWidth ? (
                    <>
                      <Columns className="h-3 w-3" aria-hidden="true" />
                      <span>2 Cột</span>
                    </>
                  ) : (
                    <>
                      <Square className="h-3 w-3" aria-hidden="true" />
                      <span>Toàn rộng</span>
                    </>
                  )}
                </Button>
              )}
            </>
          )}

          <span
            className={cn(
              "text-[10px] tabular-nums ml-1",
              descLength > MAX_DESCRIPTION_LENGTH * 0.9
                ? "text-destructive font-medium"
                : "text-muted-foreground"
            )}
          >
            {descLength.toLocaleString()} / {MAX_DESCRIPTION_LENGTH.toLocaleString()}
          </span>
        </div>
      </div>

      <Textarea
        placeholder="Nhập mô tả chi tiết, tài liệu tham khảo, tiêu chí nghiệm thu (AC)... Hỗ trợ định dạng văn bản thuần, Markdown hoặc Jira markup."
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        rows={isLarge ? 18 : 11}
        className={cn(
          "w-full resize-y text-xs leading-relaxed bg-background transition-all duration-200 border-border/80 focus-visible:ring-1 focus-visible:ring-ring font-sans shadow-2xs",
          isLarge ? "min-h-[480px]" : "min-h-[280px]"
        )}
      />

      <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground pt-1 gap-2">
        <span className="flex items-center gap-1">
          <span>Hỗ trợ Markdown và Jira markup (h1., *bold*, _italic_, - [ ], {"{code}"}). Kéo góc dưới ô để mở rộng tuỳ ý.</span>
        </span>
        {value && defaultDescription && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
          >
            <RotateCcw className="h-3 w-3" />
            Dùng lại mô tả mặc định
          </button>
        )}
      </div>
    </div>
  );
}
