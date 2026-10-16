"use client";

import React from "react";
import { Input } from "@/components/ui/input";

export interface DueDateFieldProps {
  value?: string | null;
  onChange: (value?: string) => void;
  className?: string;
  disabled?: boolean;
}

export function DueDateField({
  value,
  onChange,
  className,
  disabled,
}: DueDateFieldProps) {
  return (
    <Input
      type="date"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={className ?? "h-8 text-xs"}
      disabled={disabled}
    />
  );
}
