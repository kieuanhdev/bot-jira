import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SEVERITY_VARIANT, SEVERITY_LABEL, type Severity, type Task } from "./lib/stale-types";
import { formatTimeSpent } from "./lib/stale-utils";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge variant={SEVERITY_VARIANT[severity]}>{SEVERITY_LABEL[severity]}</Badge>;
}

export function TaskMeta({ task }: { task: Task }) {
  const worklog = formatTimeSpent(task.timeSpent);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <span>
        {task.projectKey} · {task.type}
      </span>
      {task.points != null && <span>{task.points} điểm</span>}
      {task.fixVersionNames.length > 0 && (
        <span className="max-w-48 truncate">{task.fixVersionNames.join(", ")}</span>
      )}
      {worklog && <span>{worklog} đã ghi nhận</span>}
    </div>
  );
}

export function GreenCheck({ className }: { className?: string }) {
  return <CheckCircle2 className={cn("text-emerald-600 dark:text-emerald-400", className)} aria-hidden="true" />;
}
