"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Sliders, ChevronDown, ChevronRight, Info } from "lucide-react";
import type { BulkCreateProjectMetadata, BulkCreateFieldDefaults } from "@/lib/bulk/create-types";

interface DynamicCustomFieldsProps {
  metadata: BulkCreateProjectMetadata;
  issueTypeId?: string;
  defaults?: BulkCreateFieldDefaults;
  values?: Record<string, unknown>;
  onChange: (customFields: Record<string, unknown>) => void;
  disabled?: boolean;
  className?: string;
}

const STANDARD_FIELD_IDS = new Set([
  "project",
  "issuetype",
  "summary",
  "description",
  "assignee",
  "priority",
  "labels",
  "timetracking",
  "duedate",
  "fixVersions",
  "components",
  "parent",
  "reporter",
  "resolution",
  "status",
]);

export function DynamicCustomFields({
  metadata,
  issueTypeId,
  defaults,
  values = {},
  onChange,
  disabled = false,
  className = "",
}: DynamicCustomFieldsProps) {
  const [showOptional, setShowOptional] = useState(false);

  // Determine effective issue type
  const effectiveIssueTypeId = issueTypeId || defaults?.issueTypeId || metadata.defaultIssueTypeId || "";

  // Available custom fields for this issue type
  const { requiredFields, optionalFields } = useMemo(() => {
    if (!effectiveIssueTypeId) {
      return { requiredFields: [], optionalFields: [] };
    }

    const fieldDefs = metadata.fieldsByIssueType[effectiveIssueTypeId] || [];
    const customDefs = fieldDefs.filter((f) => {
      if (STANDARD_FIELD_IDS.has(f.id)) return false;
      if (metadata.pointsFieldId && f.id === metadata.pointsFieldId) return false;
      if (metadata.epicLinkFieldId && f.id === metadata.epicLinkFieldId) return false;
      return true;
    });

    const req: typeof customDefs = [];
    const opt: typeof customDefs = [];

    for (const f of customDefs) {
      if (f.required) {
        req.push(f);
      } else {
        opt.push(f);
      }
    }

    return { requiredFields: req, optionalFields: opt };
  }, [metadata, effectiveIssueTypeId]);

  if (requiredFields.length === 0 && optionalFields.length === 0) {
    return null;
  }

  const handleFieldChange = (fieldId: string, val: unknown) => {
    const updated = { ...values };
    if (val === undefined || val === null || val === "") {
      delete updated[fieldId];
    } else {
      updated[fieldId] = val;
    }
    onChange(updated);
  };

  const renderField = (field: {
    id: string;
    name: string;
    required: boolean;
    schemaType?: string;
    allowedValues?: Array<{ id: string; name?: string; value?: string }>;
  }) => {
    const rawVal = values[field.id];
    const defaultVal = defaults?.customFields?.[field.id];
    const isUsingDefault = rawVal === undefined && defaultVal !== undefined;
    const effectiveVal = rawVal !== undefined ? rawVal : defaultVal;

    // 1. Single selection from allowedValues
    if (field.allowedValues && field.allowedValues.length > 0) {
      const stringVal = effectiveVal !== undefined && effectiveVal !== null ? String(effectiveVal) : "";
      return (
        <div key={field.id} className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-medium text-foreground flex items-center gap-1">
              <span>{field.name}</span>
              {field.required && <span className="text-destructive">*</span>}
              {isUsingDefault && (
                <span className="text-[10px] text-muted-foreground font-normal">(mặc định)</span>
              )}
            </Label>
          </div>
          <Select
            value={stringVal}
            onValueChange={(newVal) => handleFieldChange(field.id, newVal || undefined)}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 text-xs cursor-pointer bg-background">
              <SelectValue placeholder={`Chọn ${field.name.toLowerCase()}...`} />
            </SelectTrigger>
            <SelectContent>
              {field.allowedValues.map((v) => (
                <SelectItem key={v.id} value={v.id} className="text-xs cursor-pointer">
                  {v.name || v.value || v.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    // 2. Number input
    if (field.schemaType === "number") {
      const numVal = effectiveVal !== undefined && effectiveVal !== null ? String(effectiveVal) : "";
      return (
        <div key={field.id} className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-medium text-foreground flex items-center gap-1">
              <span>{field.name}</span>
              {field.required && <span className="text-destructive">*</span>}
              {isUsingDefault && (
                <span className="text-[10px] text-muted-foreground font-normal">(mặc định)</span>
              )}
            </Label>
          </div>
          <Input
            type="number"
            value={numVal}
            onChange={(e) => {
              const val = e.target.value.trim();
              handleFieldChange(field.id, val ? Number(val) : undefined);
            }}
            placeholder={`Nhập ${field.name.toLowerCase()}...`}
            disabled={disabled}
            className="h-8 text-xs bg-background"
          />
        </div>
      );
    }

    // 3. Date input
    if (field.schemaType === "date") {
      const dateVal = effectiveVal !== undefined && effectiveVal !== null ? String(effectiveVal) : "";
      return (
        <div key={field.id} className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-medium text-foreground flex items-center gap-1">
              <span>{field.name}</span>
              {field.required && <span className="text-destructive">*</span>}
              {isUsingDefault && (
                <span className="text-[10px] text-muted-foreground font-normal">(mặc định)</span>
              )}
            </Label>
          </div>
          <Input
            type="date"
            value={dateVal}
            onChange={(e) => handleFieldChange(field.id, e.target.value || undefined)}
            disabled={disabled}
            className="h-8 text-xs bg-background"
          />
        </div>
      );
    }

    // 4. Default string / text input
    const strVal = effectiveVal !== undefined && effectiveVal !== null ? String(effectiveVal) : "";
    return (
      <div key={field.id} className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-medium text-foreground flex items-center gap-1">
            <span>{field.name}</span>
            {field.required && <span className="text-destructive">*</span>}
            {isUsingDefault && (
              <span className="text-[10px] text-muted-foreground font-normal">(mặc định)</span>
            )}
          </Label>
        </div>
        <Input
          type="text"
          value={strVal}
          onChange={(e) => handleFieldChange(field.id, e.target.value || undefined)}
          placeholder={`Nhập ${field.name.toLowerCase()}...`}
          disabled={disabled}
          className="h-8 text-xs bg-background"
        />
      </div>
    );
  };

  return (
    <div className={`rounded-md border border-border/70 bg-muted/20 p-3 space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Sliders className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span>Trường mở rộng (Custom Fields)</span>
          {requiredFields.length > 0 && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              {requiredFields.length} bắt buộc
            </span>
          )}
        </div>
        {optionalFields.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowOptional(!showOptional)}
            className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground gap-1"
          >
            {showOptional ? (
              <>
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
                <span>Thu gọn ({optionalFields.length} tùy chọn)</span>
              </>
            ) : (
              <>
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
                <span>+{optionalFields.length} trường tùy chọn</span>
              </>
            )}
          </Button>
        )}
      </div>

      {/* Required Custom Fields */}
      {requiredFields.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {requiredFields.map(renderField)}
        </div>
      )}

      {/* Optional Custom Fields */}
      {showOptional && optionalFields.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50">
          {optionalFields.map(renderField)}
        </div>
      )}
    </div>
  );
}
