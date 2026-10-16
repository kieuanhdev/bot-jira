"use client";

import React from "react";
import { ComponentsCombobox } from "../components-combobox";
import type {
  BulkCreateFieldDefaults,
  BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";

export interface ComponentsFieldProps {
  value?: string[];
  onChange: (value?: string[]) => void;
  metadata: BulkCreateProjectMetadata;
  defaults?: BulkCreateFieldDefaults;
  compact?: boolean;
  disabled?: boolean;
}

export function ComponentsField({
  value,
  onChange,
  metadata,
  defaults,
  compact = false,
  disabled,
}: ComponentsFieldProps) {
  const components = metadata.components || [];

  const placeholder =
    defaults?.componentIds && defaults.componentIds.length > 0
      ? components
          .filter((c) => defaults.componentIds?.includes(c.id))
          .map((c) => c.name)
          .join(", ") || "—"
      : "—";

  return (
    <ComponentsCombobox
      options={components}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      compact={compact}
      disabled={disabled}
    />
  );
}
