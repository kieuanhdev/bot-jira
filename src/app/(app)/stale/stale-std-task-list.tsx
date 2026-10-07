import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { REQUIREMENT_LABELS } from "@/lib/issues/standardization";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Keyboard,
  ListChecks,
  X,
} from "lucide-react";
import type { StandardizationTask } from "./lib/stale-types";
import {
  buildMissingBulkFields,
  formatDueDate,
  formatTimeSpent,
  getEstimationMissingLabel,
} from "./lib/stale-utils";
import { StaleEmptyState } from "./stale-empty-state";
import { BulkStandardizationAction } from "./stale-standardization-action";
import { QuickFixVersionSelect, QuickPointsEditor } from "./stale-std-quick-edit";

const POLICY_LABELS: Record<string, string> = {
  "planned-work": "Planned",
  "maintenance-work": "Maintenance",
};
const policyLabel = (id: string) => POLICY_LABELS[id] ?? "Default";

const returnToStd = encodeURIComponent("/stale?view=my-work&tab=standardization");

interface StdTaskItemProps {
  task: StandardizationTask;
  isSelected: boolean;
  isActive?: boolean;
  allStdTasks: StandardizationTask[];
  onToggleSelect: (key: string) => void;
}

function StdTaskMobileCard({ task, isSelected, allStdTasks, onToggleSelect }: StdTaskItemProps) {
  const missingFields = buildMissingBulkFields(new Set([task.jiraKey]), allStdTasks);

  return (
    <div
      className={cn(
        "p-4 transition-colors duration-150 hover:bg-muted/40",
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
          <Badge variant="secondary" className="text-[11px]">
            {task.status}
          </Badge>
        </div>
        <Badge variant="outline" className="text-[10px]">
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
            className="text-[10px] flex items-center gap-1 font-normal"
          >
            <X className="h-3 w-3" aria-hidden />
            {req === "ESTIMATION"
              ? getEstimationMissingLabel(task, allStdTasks)
              : `Thiếu ${REQUIREMENT_LABELS[req]}`}
          </Badge>
        ))}
      </div>

      {(task.missing.includes("FIX_VERSION") ||
        (task.missing.includes("ESTIMATION") &&
          getEstimationMissingLabel(task, allStdTasks) !== "Thiếu Estimate")) && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          {task.missing.includes("ESTIMATION") &&
            getEstimationMissingLabel(task, allStdTasks) !== "Thiếu Estimate" && (
              <QuickPointsEditor jiraKey={task.jiraKey} />
            )}
          {task.missing.includes("FIX_VERSION") && <QuickFixVersionSelect jiraKey={task.jiraKey} />}
        </div>
      )}

      {/* Secondary operational signals */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
        {task.isStale && (
          <Badge variant="warning" className="text-[10px]">
            Ngâm {task.stateAgeDays}/{task.slaDays} ngày
          </Badge>
        )}
        {task.overdueDays > 0 && (
          <Badge variant="danger" className="text-[10px]">
            Quá hạn {task.overdueDays} ngày
          </Badge>
        )}
        {task.isBlocked && (
          <Badge variant="danger" className="text-[10px]">
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

function StdTaskRow({ task, isSelected, isActive, allStdTasks, onToggleSelect }: StdTaskItemProps) {
  const missingFields = buildMissingBulkFields(new Set([task.jiraKey]), allStdTasks);

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
                    {getEstimationMissingLabel(task, allStdTasks)}
                  </Badge>
                  {getEstimationMissingLabel(task, allStdTasks) !== "Thiếu Estimate" && (
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

/** Standardization queue: cards on mobile, table on desktop. */
export function StandardizationTaskList({
  filteredStdTasks,
  allStdTasks,
  selectedStdTasks,
  incompleteCount,
  totalActive,
  hasStdFilters,
  onFilterToSingleProject,
  onClearFilters,
  onViewStale,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
}: {
  filteredStdTasks: StandardizationTask[];
  allStdTasks: StandardizationTask[];
  selectedStdTasks: Set<string>;
  incompleteCount: number;
  totalActive: number;
  hasStdFilters: boolean;
  onFilterToSingleProject: (projectKey: string) => void;
  onClearFilters: () => void;
  onViewStale: () => void;
  onToggleSelect: (key: string) => void;
  onSelectAll: (checked: boolean) => void;
  onClearSelection: () => void;
}) {
  const router = useRouter();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const keys = useMemo(() => filteredStdTasks.map((t) => t.jiraKey), [filteredStdTasks]);

  const move = useCallback(
    (delta: number) => {
      if (keys.length === 0) return;
      const current = activeKey ? keys.indexOf(activeKey) : -1;
      const next = keys[Math.min(keys.length - 1, Math.max(0, current + delta))];
      setActiveKey(next);
      document
        .querySelector(`[data-task-row="${CSS.escape(next)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    },
    [activeKey, keys]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) || el.closest("[role=dialog],[role=listbox],[role=menu]"))) return;
      const key = e.key.toLowerCase();
      if (key === "j") move(1);
      else if (key === "k") move(-1);
      else if (key === "/") {
        const search = document.querySelector<HTMLInputElement>('[aria-label="Tìm trong task chuẩn hóa"]');
        if (search) {
          e.preventDefault();
          search.focus();
        }
      } else if (activeKey && (key === "x" || key === " ")) {
        e.preventDefault();
        onToggleSelect(activeKey);
      } else if (activeKey && (key === "o" || key === "enter")) {
        router.push(`/issue/${activeKey}`);
      } else if (activeKey && key === "p") {
        const input = Array.from(
          document.querySelectorAll<HTMLInputElement>(`[data-quick-points="${CSS.escape(activeKey)}"]`)
        ).find((node) => node.offsetParent !== null);
        if (input) {
          e.preventDefault();
          input.focus();
        }
      } else if (activeKey && key === "w") {
        const task = filteredStdTasks.find((t) => t.jiraKey === activeKey);
        if (task?.missing.includes("WORKLOG")) router.push(`/issue/${activeKey}?action=log-work&returnTo=${returnToStd}`);
      } else if (key === "escape") setActiveKey(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeKey, move, onToggleSelect, router, filteredStdTasks]);

  return (
    <Card className="shadow-none">
      <CardHeader className="gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-primary" aria-hidden /> Hàng đợi chuẩn hóa
          </CardTitle>
          <CardDescription className="mt-1 text-xs">
            Hiển thị {filteredStdTasks.length}/{incompleteCount} task chưa đạt chuẩn dữ liệu.
          </CardDescription>
        </div>

        {selectedStdTasks.size > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5"
            role="status"
            aria-live="polite"
          >
            <span className="text-xs font-medium text-foreground">Đã chọn {selectedStdTasks.size} task</span>
            <BulkStandardizationAction
              selectedKeys={selectedStdTasks}
              allTasks={allStdTasks}
              incompleteCount={incompleteCount}
              onFilterToSingleProject={onFilterToSingleProject}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              className="h-7 cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            >
              Bỏ chọn
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {filteredStdTasks.length === 0 ? (
          incompleteCount === 0 && totalActive > 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <p className="text-base font-semibold text-foreground">
                  Tuyệt vời! Toàn bộ task của bạn đã đạt chuẩn dữ liệu
                </p>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                  Không có task nào bị thiếu Estimate, Worklog, Fix Version hoặc Due date.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onViewStale}
                className="cursor-pointer mt-2"
              >
                Xem phân tích tồn đọng (SLA)
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" aria-hidden />
              </Button>
            </div>
          ) : (
            <StaleEmptyState
              filtered={hasStdFilters}
              onClear={onClearFilters}
              title={hasStdFilters ? "Không có task nào khớp với bộ lọc" : "Không có task đang hoạt động"}
              hint={
                hasStdFilters
                  ? "Thử thay đổi bộ lọc hoặc xóa lọc để xem lại danh sách."
                  : "Bạn hiện không có task nào đang chờ thực hiện trong các dự án được chọn."
              }
            />
          )
        ) : (
          <>
            {/* Mobile View: Cards */}
            <div className="divide-y lg:hidden">
              {filteredStdTasks.map((task) => (
                <StdTaskMobileCard
                  key={task.jiraKey}
                  task={task}
                  isSelected={selectedStdTasks.has(task.jiraKey)}
                  allStdTasks={allStdTasks}
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </div>

            {/* Desktop View: Table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-muted/40 text-xs text-muted-foreground border-b">
                    <th className="w-10 px-4 py-3 text-center">
                      <Checkbox
                        checked={
                          filteredStdTasks.length > 0 &&
                          filteredStdTasks.every((t) => selectedStdTasks.has(t.jiraKey))
                        }
                        onCheckedChange={(checked) => onSelectAll(Boolean(checked))}
                        aria-label="Chọn tất cả task đang hiển thị"
                        className="cursor-pointer"
                      />
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">Task</th>
                    <th className="px-3 py-3 font-medium">Kiểm tra tiêu chuẩn</th>
                    <th className="px-3 py-3 font-medium">SLA &amp; rủi ro</th>
                    <th className="px-4 py-3 text-right font-medium">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredStdTasks.map((task) => (
                    <StdTaskRow
                      key={task.jiraKey}
                      task={task}
                      isSelected={selectedStdTasks.has(task.jiraKey)}
                      isActive={task.jiraKey === activeKey}
                      allStdTasks={allStdTasks}
                      onToggleSelect={onToggleSelect}
                    />
                  ))}
                </tbody>
              </table>
              <p className="hidden items-center gap-2 border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground lg:flex">
                <Keyboard className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  <kbd className="font-mono">J</kbd>/<kbd className="font-mono">K</kbd> di chuyển ·{" "}
                  <kbd className="font-mono">X</kbd> chọn · <kbd className="font-mono">O</kbd> mở ·{" "}
                  <kbd className="font-mono">P</kbd> nhập points · <kbd className="font-mono">W</kbd> ghi worklog ·{" "}
                  <kbd className="font-mono">/</kbd> tìm kiếm · <kbd className="font-mono">Esc</kbd> bỏ chọn dòng
                </span>
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
