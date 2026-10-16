"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ShowMoreFooter } from "@/components/shared/show-more-footer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useShowMore } from "@/hooks/use-show-more";
import { ArrowRight, CheckCircle2, Keyboard, ListChecks } from "lucide-react";
import type { StandardizationTask } from "./lib/stale-types";
import { buildProjectEstimationUsage } from "./lib/stale-utils";
import { StaleEmptyState } from "./stale-empty-state";
import { BulkStandardizationAction } from "./stale-standardization-action";
import { StdTaskRow } from "./stale-std-task-row";
import { StdMobileCard } from "./stale-std-mobile-card";
import { useStdKeyboardNav } from "./hooks/use-std-keyboard-nav";

export interface StandardizationTaskListProps {
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
}

/** Standardization queue: single DOM tree (cards on mobile, table on desktop via useMediaQuery). */
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
}: StandardizationTaskListProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const usageMap = useMemo(() => buildProjectEstimationUsage(allStdTasks), [allStdTasks]);

  const { visibleCount, showMore } = useShowMore(filteredStdTasks.length, 50, 50);

  const visibleTasks = useMemo(
    () => filteredStdTasks.slice(0, visibleCount),
    [filteredStdTasks, visibleCount]
  );
  const keys = useMemo(() => visibleTasks.map((t) => t.jiraKey), [visibleTasks]);

  const { activeKey } = useStdKeyboardNav({
    keys,
    tasks: filteredStdTasks,
    onToggleSelect,
  });

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
            {!isDesktop ? (
              /* Mobile View: Cards */
              <div className="divide-y">
                {visibleTasks.map((task) => (
                  <StdMobileCard
                    key={task.jiraKey}
                    task={task}
                    isSelected={selectedStdTasks.has(task.jiraKey)}
                    allStdTasks={allStdTasks}
                    usageMap={usageMap}
                    onToggleSelect={onToggleSelect}
                  />
                ))}
              </div>
            ) : (
              /* Desktop View: Table */
              <div className="overflow-x-auto">
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
                    {visibleTasks.map((task) => (
                      <StdTaskRow
                        key={task.jiraKey}
                        task={task}
                        isSelected={selectedStdTasks.has(task.jiraKey)}
                        isActive={task.jiraKey === activeKey}
                        allStdTasks={allStdTasks}
                        usageMap={usageMap}
                        onToggleSelect={onToggleSelect}
                      />
                    ))}
                  </tbody>
                </table>
                <p className="flex items-center gap-2 border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
                  <Keyboard className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    <kbd className="font-mono">J</kbd>/<kbd className="font-mono">K</kbd> di chuyển ·{" "}
                    <kbd className="font-mono">X</kbd> chọn · <kbd className="font-mono">O</kbd> mở ·{" "}
                    <kbd className="font-mono">P</kbd> nhập points · <kbd className="font-mono">W</kbd> ghi worklog ·{" "}
                    <kbd className="font-mono">/</kbd> tìm kiếm · <kbd className="font-mono">Esc</kbd> bỏ chọn dòng
                  </span>
                </p>
              </div>
            )}

            <ShowMoreFooter
              visibleCount={visibleCount}
              totalCount={filteredStdTasks.length}
              onShowMore={showMore}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
