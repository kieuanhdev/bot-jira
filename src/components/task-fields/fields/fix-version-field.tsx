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

export interface FixVersionFieldProps {
  value?: string[];
  onChange: (value?: string[]) => void;
  metadata: BulkCreateProjectMetadata;
  defaults?: BulkCreateFieldDefaults;
  className?: string;
  disabled?: boolean;
}

export function FixVersionField({
  value,
  onChange,
  metadata,
  defaults,
  className,
  disabled,
}: FixVersionFieldProps) {
  const currentId = value?.[0] || "";
  const placeholder = defaults?.fixVersionIds?.[0]
    ? `${metadata.versionOptions.find((v) => v.id === defaults.fixVersionIds?.[0])?.name || "Mặc định"} (mặc định)`
    : "Mặc định";

  return (
    <Select
      value={currentId}
      onValueChange={(val) => onChange(val ? [val] : undefined)}
      disabled={disabled}
    >
      <SelectTrigger className={`cursor-pointer ${className ?? "h-8 text-xs"}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {metadata.versionOptions
          .filter((v) => !v.archived)
          .map((v) => (
            <SelectItem key={v.id} value={v.id} className="text-xs cursor-pointer">
              {v.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
