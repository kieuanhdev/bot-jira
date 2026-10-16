"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import type { BulkCreateFieldDefaults } from "@/lib/bulk/create-types";

export interface PointsFieldProps {
  value?: number | null;
  onChange: (value?: number) => void;
  defaults?: BulkCreateFieldDefaults;
  className?: string;
  disabled?: boolean;
}

export function PointsField({
  value,
  onChange,
  defaults,
  className,
  disabled,
}: PointsFieldProps) {
  return (
    <Input
      type="number"
      min="0"
      placeholder={defaults?.points != null ? String(defaults.points) : "—"}
      value={value ?? ""}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        onChange(Number.isFinite(v) && v >= 0 ? v : undefined);
      }}
      className={className ?? "h-8 text-xs"}
      disabled={disabled}
    />
  );
}
