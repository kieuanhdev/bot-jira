import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Check, Clock, ListChecks, X } from "lucide-react";
import type { StandardizationTask } from "./lib/stale-types";
import {
  buildMissingBulkFields,
  formatDueDate,
  formatTimeSpent,
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

export interface StdTaskRowProps {
  task: StandardizationTask;
  isSelected: boolean;
  isActive?: boolean;
  allStdTasks: StandardizationTask[];
  usageMap?: Map<string, ProjectEstimationUsage>;
  onToggleSelect: (key: string) => void;
}

export function StdTaskRow({
  task,
  isSelected,
  isActive,
  allStdTasks,
  usageMap,
  onToggleSelect,
}: StdTaskRowProps) {
  const missingFields = buildMissingBulkFields(new Set([task.jiraKey]), allStdTasks, usageMap);
  const estimationLabel = getEstimationMissingLabel(task, usageMap ?? allStdTasks);

  return (
    <tr
      data-task-row={task.jiraKey}
      className={cn(
        "transition-colors duration-150 hover:bg-muted/40 group",
        isSelected && "bg-primary/[0.035]",
        isActive && "bg-primary/[0.07] ring-1 ring-inset ring-primary/40"
      )}
    >
      {/* Checkbox */}
      <td className="w-10 px-4 py-3.5 text-center align-top">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(task.jiraKey)}
          aria-label={`Chọn task ${task.jiraKey}`}
          className="cursor-pointer"
        />
      </td>

      {/* Task details */}
      <td className="max-w-sm px-4 py-3.5 align-top">
        <div className="flex items-center gap-2">
          <Link
            href={`/issue/${task.jiraKey}`}
            className="cursor-pointer font-mono text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {task.jiraKey}
          </Link>
          <span className="text-[11px] text-muted-foreground">
            {task.projectKey} · {task.type} · {policyLabel(task.policyId)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm font-medium text-foreground group-hover:text-primary transition-colors">
          {task.summary || "Task chưa đặt tên"}
        </p>
        <Badge variant="secondary" className="mt-1.5 text-[11px]">
          {task.status}
        </Badge>
      </td>

      {/* Checklist Badges */}
      <td className="px-3 py-3.5 align-top">
        <div className="grid grid-cols-2 gap-1.5 text-xs max-w-xs">
          {/* Estimate */}
          {task.required.includes("ESTIMATION") && (
            <div>
              {task.missing.includes("ESTIMATION") ? (
                <div className="space-y-1">
                  <Badge
                    variant="danger"
                    className="text-[10px] w-full justify-start font-normal"
                  >
                    <X className="h-3 w-3 mr-1 shrink-0" aria-hidden />{" "}
                    {estimationLabel}
                  </Badge>
                  {estimationLabel !== "Thiếu Estimate" && (
                    <QuickPointsEditor jiraKey={task.jiraKey} />
                  )}
                </div>
              ) : (
                <Badge
                  variant="success"
                  className="text-[10px] w-full justify-start font-normal"
                >
                  <Check className="h-3 w-3 mr-1 shrink-0" aria-hidden />
                  {task.points
                    ? `${task.points}pt`
                    : task.originalEstimateSeconds
                    ? "Có Est"
                    : "Đã có"}
                </Badge>
              )}
            </div>
          )}

          {/* Worklog */}
          {task.required.includes("WORKLOG") && (
            <div>
              {task.missing.includes("WORKLOG") ? (
                <Link
                  href={`/issue/${task.jiraKey}?action=log-work&returnTo=${returnToStd}`}
                  title={`Ghi Worklog cho ${task.jiraKey}`}
                  className="block group/wl"
                >
                  <Badge
                    variant="danger"
                    className="text-[10px] w-full justify-start font-normal cursor-pointer group-hover/wl:bg-destructive/20 transition-colors"
                  >
                    <Clock className="h-3 w-3 mr-1 shrink-0" aria-hidden /> Chưa log work
                  </Badge>
                </Link>
              ) : (
                <Badge
                  variant="success"
                  className="text-[10px] w-full justify-start font-normal"
                >
                  <Check className="h-3 w-3 mr-1 shrink-0" aria-hidden />
                  {formatTimeSpent(task.timeSpent) ?? "Đã log"}
                </Badge>
              )}
            </div>
          )}

          {/* Fix Version */}
          {task.required.includes("FIX_VERSION") && (
            <div>
              {task.missing.includes("FIX_VERSION") ? (
                <div className="space-y-1">
                  <Badge
                    variant="danger"
                    className="text-[10px] w-full justify-start font-normal"
                  >
                    <X className="h-3 w-3 mr-1 shrink-0" aria-hidden /> Thiếu FixVer
                  </Badge>
                  <QuickFixVersionSelect jiraKey={task.jiraKey} />
                </div>
              ) : (
                <Badge
                  variant="success"
                  className="text-[10px] w-full justify-start font-normal truncate max-w-32"
                >
                  <Check className="h-3 w-3 mr-1 shrink-0" aria-hidden />
                  {task.fixVersionNames[0] ?? "Có FV"}
                </Badge>
              )}
            </div>
          )}

          {/* Due Date */}
          {task.required.includes("DUE_DATE") && (
            <div>
              {task.missing.includes("DUE_DATE") ? (
                <Badge
                  variant="danger"
                  className="text-[10px] w-full justify-start font-normal"
                >
                  <X className="h-3 w-3 mr-1 shrink-0" aria-hidden /> Thiếu Due date
                </Badge>
              ) : (
                <Badge
                  variant="success"
                  className="text-[10px] w-full justify-start font-normal"
                >
                  <Check className="h-3 w-3 mr-1 shrink-0" aria-hidden />
                  {formatDueDate(task.dueDate)}
                </Badge>
              )}
            </div>
          )}
        </div>
      </td>

      {/* Operational Signals */}
      <td className="px-3 py-3.5 align-top">
        <div className="space-y-1 text-xs">
          {task.isStale ? (
            <Badge variant="warning" className="text-[11px] font-normal">
              Ngâm {task.stateAgeDays}/{task.slaDays} ngày
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground block">
              Trong hạn SLA ({task.stateAgeDays}/{task.slaDays}d)
            </span>
          )}
          {task.overdueDays > 0 && (
            <div>
              <Badge variant="danger" className="text-[11px] font-normal">
                Quá hạn {task.overdueDays} ngày
              </Badge>
            </div>
          )}
          {task.isBlocked && (
            <div>
              <Badge variant="danger" className="text-[11px] font-normal">
                Bị chặn
              </Badge>
            </div>
          )}
        </div>
      </td>

      {/* Actions */}
      <td className="px-4 py-3.5 text-right align-top">
        <div className="flex items-center justify-end gap-1.5">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="cursor-pointer text-xs h-8 text-muted-foreground hover:text-foreground"
          >
            <Link href={`/issue/${task.jiraKey}`}>Mở task</Link>
          </Button>
          {task.missing.includes("WORKLOG") && (
            <Button
              asChild
              size="sm"
              variant={task.missing.length === 1 ? "default" : "outline"}
              className="cursor-pointer text-xs h-8"
            >
              <Link
                href={`/issue/${task.jiraKey}?action=log-work&returnTo=${returnToStd}`}
              >
                <Clock className="h-3.5 w-3.5 mr-1" aria-hidden />
                Ghi Worklog
              </Link>
            </Button>
          )}
          {task.missing.some((m) => m !== "WORKLOG") && (
            <Button
              asChild
              size="sm"
              className="cursor-pointer text-xs h-8 bg-primary/90 hover:bg-primary text-primary-foreground font-medium"
            >
              <Link
                href={`/bulk?project=${encodeURIComponent(task.projectKey)}&keys=${task.jiraKey}&fields=${missingFields}&returnTo=standardization`}
              >
                <ListChecks className="h-3.5 w-3.5 mr-1" aria-hidden />
                {task.missing.includes("WORKLOG") ? "Sửa trường" : "Chuẩn hóa"}
              </Link>
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
