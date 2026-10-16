"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import type { BulkCreateFieldDefaults } from "@/lib/bulk/create-types";

export interface EstimateFieldProps {
  value?: string;
  onChange: (value?: string) => void;
  defaults?: BulkCreateFieldDefaults;
  className?: string;
  disabled?: boolean;
}

export function EstimateField({
  value,
  onChange,
  defaults,
  className,
  disabled,
}: EstimateFieldProps) {
  return (
    <Input
      placeholder={defaults?.originalEstimate || "1d 2h"}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value.trim() || undefined)}
      className={className ?? "h-8 text-xs"}
      disabled={disabled}
    />
  );
}
