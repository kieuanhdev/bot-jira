"use client";

import { Button } from "@/components/ui/button";
import { ArrowRightLeft, Clock, Edit3 } from "lucide-react";
import type { OperationKind } from "./lib/bulk-logic";

export interface BulkOperationModeSwitchProps {
  operationKind: OperationKind;
  onChange: (kind: OperationKind) => void;
}

export function BulkOperationModeSwitch({
  operationKind,
  onChange,
}: BulkOperationModeSwitchProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b pb-3">
      <span className="text-xs font-semibold text-muted-foreground mr-1">Chế độ:</span>
      <Button
        type="button"
        size="sm"
        variant={operationKind === "update-fields" ? "default" : "outline"}
        onClick={() => onChange("update-fields")}
        className="gap-1.5 text-xs h-7 cursor-pointer"
      >
        <Edit3 className="h-3.5 w-3.5" />
        Cập nhật trường
      </Button>
      <Button
        type="button"
        size="sm"
        variant={operationKind === "transition" ? "default" : "outline"}
        onClick={() => onChange("transition")}
        className="gap-1.5 text-xs h-7 cursor-pointer"
      >
        <ArrowRightLeft className="h-3.5 w-3.5" />
        Chuyển trạng thái
      </Button>
      <Button
        type="button"
        size="sm"
        variant={operationKind === "log-work" ? "default" : "outline"}
        onClick={() => onChange("log-work")}
        className="gap-1.5 text-xs h-7 cursor-pointer"
      >
        <Clock className="h-3.5 w-3.5" />
        Ghi Worklog
      </Button>
    </div>
  );
}
