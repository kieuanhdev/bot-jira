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

export interface PriorityFieldProps {
  value?: string;
  onChange: (value?: string) => void;
  metadata: BulkCreateProjectMetadata;
  defaults?: BulkCreateFieldDefaults;
  className?: string;
  disabled?: boolean;
}

export function PriorityField({
  value,
  onChange,
  metadata,
  defaults,
  className,
  disabled,
}: PriorityFieldProps) {
  const placeholder = defaults?.priorityId
    ? `${metadata.priorityOptions.find((p) => p.id === defaults.priorityId)?.name || "Mặc định"} (mặc định)`
    : "Mặc định";

  return (
    <Select
      value={value || ""}
      onValueChange={(val) => onChange(val || undefined)}
      disabled={disabled}
    >
      <SelectTrigger className={`cursor-pointer ${className ?? "h-8 text-xs"}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {metadata.priorityOptions.map((p) => (
          <SelectItem key={p.id} value={p.id} className="text-xs cursor-pointer">
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
