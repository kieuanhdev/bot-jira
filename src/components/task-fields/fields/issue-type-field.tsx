"use client";

import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  BulkCreateFieldDefaults,
  BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";

export interface IssueTypeFieldProps {
  value?: string;
  onChange: (value?: string) => void;
  metadata: BulkCreateProjectMetadata;
  defaults?: BulkCreateFieldDefaults;
  effectiveName?: string;
  className?: string;
  disabled?: boolean;
}

export function IssueTypeField({
  value,
  onChange,
  metadata,
  defaults,
  effectiveName,
  className,
  disabled,
}: IssueTypeFieldProps) {
  const placeholder =
    effectiveName ||
    (defaults?.issueTypeId
      ? `${metadata.issueTypes.find((t) => t.id === defaults.issueTypeId)?.name || "Mặc định"} (mặc định)`
      : metadata.defaultIssueTypeId
        ? `${metadata.issueTypes.find((t) => t.id === metadata.defaultIssueTypeId)?.name || "Mặc định"} (Jira mặc định)`
        : "Chọn loại task *");

  const hasNoSelection = !value && !defaults?.issueTypeId && !metadata.defaultIssueTypeId;

  return (
    <Select
      value={value || ""}
      onValueChange={(val) => onChange(val || undefined)}
      disabled={disabled}
    >
      <SelectTrigger
        className={`cursor-pointer ${className ?? "h-8 text-xs"} ${
          hasNoSelection
            ? "border-warning/40 bg-warning/10"
            : value
              ? ""
              : "text-muted-foreground"
        }`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {metadata.issueTypes.map((t) => (
          <SelectItem key={t.id} value={t.id} className="text-xs cursor-pointer">
            {t.subtask ? `⚡ ${t.name}` : t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
