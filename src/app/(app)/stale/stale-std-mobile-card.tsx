import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { REQUIREMENT_LABELS } from "@/lib/issues/standardization";
import { cn } from "@/lib/utils";
import { Clock, ListChecks, X } from "lucide-react";
import type { StandardizationTask } from "./lib/stale-types";
import {
  buildMissingBulkFields,
  getEstimationMissingLabel,
  type ProjectEstimationUsage,
} from "./lib/stale-utils";
import { QuickFixVersionSelect, QuickPointsEditor } from "./stale-std-quick-edit";

const POLICY_LABELS: Record<string, string> = {
  "planned-work": "Planned",
  "maintenance-work": "Maintenance",
};
const policyLabel = (id: string) => POLICY_LABELS[id] ?? "Default";
const returnToStd = encodeURIComponent("/stale?view=my-work&tab=standardization");

export interface StdMobileCardProps {
  task: StandardizationTask;
  isSelected: boolean;
  allStdTasks: StandardizationTask[];
  usageMap?: Map<string, ProjectEstimationUsage>;
  onToggleSelect: (key: string) => void;
}

export function StdMobileCard({
  task,
  isSelected,
  allStdTasks,
  usageMap,
  onToggleSelect,
}: StdMobileCardProps) {
  const missingFields = buildMissingBulkFields(new Set([task.jiraKey]), allStdTasks, usageMap);
  const estimationLabel = getEstimationMissingLabel(task, usageMap ?? allStdTasks);

  return (
    <div
      className={cn(
        "p-4 transition-colors duration-150 hover:bg-muted/40 [content-visibility:auto] [contain-intrinsic-size:auto_96px]",
        isSelected && "bg-primary/[0.04]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(task.jiraKey)}
            aria-label={`Chọn task ${task.jiraKey}`}
            className="cursor-pointer"
          />
          <Link
            href={`/issue/${task.jiraKey}`}
            className="font-mono text-xs font-semibold text-primary hover:underline"
          >
            {task.jiraKey}
          </Link>
          <Badge variant="secondary" className="text-2xs">
            {task.status}
          </Badge>
        </div>
        <Badge variant="outline" className="text-2xs">
          {policyLabel(task.policyId)}
        </Badge>
      </div>

      <p className="mt-2 text-sm font-medium text-foreground line-clamp-2">
        {task.summary || "Task chưa đặt tên"}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {task.missing.map((req) => (
          <Badge
            key={req}
            variant="danger"
            className="text-2xs flex items-center gap-1 font-normal"
          >
            <X className="h-3 w-3" aria-hidden />
            {req === "ESTIMATION"
              ? estimationLabel
              : `Thiếu ${REQUIREMENT_LABELS[req]}`}
          </Badge>
        ))}
      </div>

      {(task.missing.includes("FIX_VERSION") ||
        (task.missing.includes("ESTIMATION") &&
          estimationLabel !== "Thiếu Estimate")) && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          {task.missing.includes("ESTIMATION") &&
            estimationLabel !== "Thiếu Estimate" && (
              <QuickPointsEditor jiraKey={task.jiraKey} />
            )}
          {task.missing.includes("FIX_VERSION") && <QuickFixVersionSelect jiraKey={task.jiraKey} />}
        </div>
      )}

      {/* Secondary operational signals */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
        {task.isStale && (
          <Badge variant="warning" className="text-2xs">
            Ngâm {task.stateAgeDays}/{task.slaDays} ngày
          </Badge>
        )}
        {task.overdueDays > 0 && (
          <Badge variant="danger" className="text-2xs">
            Quá hạn {task.overdueDays} ngày
          </Badge>
        )}
        {task.isBlocked && (
          <Badge variant="danger" className="text-2xs">
            Bị chặn
          </Badge>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
        <Button asChild variant="outline" size="sm" className="cursor-pointer text-xs h-7">
          <Link href={`/issue/${task.jiraKey}`}>Mở task</Link>
        </Button>
        <div className="flex items-center gap-1.5">
          {task.missing.includes("WORKLOG") && (
            <Button
              asChild
              size="sm"
              variant={task.missing.length === 1 ? "default" : "outline"}
              className="cursor-pointer text-xs h-7"
            >
              <Link
                href={`/issue/${task.jiraKey}?action=log-work&returnTo=${returnToStd}`}
              >
                <Clock className="h-3 w-3 mr-1" aria-hidden />
                Ghi Worklog
              </Link>
            </Button>
          )}
          {task.missing.some((m) => m !== "WORKLOG") && (
            <Button asChild size="sm" className="cursor-pointer text-xs h-7">
              <Link
                href={`/bulk?project=${encodeURIComponent(task.projectKey)}&keys=${task.jiraKey}&fields=${missingFields}&returnTo=standardization`}
              >
                <ListChecks className="h-3.5 w-3.5 mr-1" aria-hidden />
                {task.missing.includes("WORKLOG") ? "Sửa trường" : "Chuẩn hóa"}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
