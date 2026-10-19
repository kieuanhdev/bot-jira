"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton } from "@/components/shared/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, getErrorMessage } from "@/lib/api-client";
import { adminKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useFlashMessage } from "@/hooks/use-flash-message";
import { useNow } from "@/hooks/use-now";
import {
  useJobRows,
  type ExtendedJobState,
  type JobFilter,
  JOB_LABELS,
  HEAVY_JOBS,
  getJobConfirmDescription,
} from "./jobs/use-job-rows";
import { JobTableRow, JobTableHeader } from "./jobs/job-table-row";
import { JobMobileItem } from "./jobs/job-mobile-item";
import { JobFilterTabs } from "./jobs/job-filter-tabs";

export type { ExtendedJobState };

export interface JobsCardProps {
  jobs: ExtendedJobState[];
  failingJobs: ExtendedJobState[];
  runningJobs?: string[];
  stuckJobs?: string[];
  schedules?: Record<string, { cron: string; label: string }>;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function JobsCard({
  jobs,
  failingJobs,
  runningJobs = [],
  stuckJobs = [],
  schedules = {},
  isLoading,
  onRefresh,
}: JobsCardProps) {
  const queryClient = useQueryClient();
  const [jobFilter, setJobFilter] = React.useState<JobFilter>("all");
  const [expandedJobKeys, setExpandedJobKeys] = React.useState<Set<string>>(new Set());
  const [confirmJob, setConfirmJob] = React.useState<string | null>(null);

  const { message: toastMessage, show: showToast } = useFlashMessage<{ text: string; tone: "success" | "danger" }>(4000);
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const now = useNow();

  const { rows, counts } = useJobRows({ jobs, failingJobs, runningJobs, stuckJobs, schedules, jobFilter, now });

  const toggleJobExpanded = (job: string) => {
    setExpandedJobKeys((prev) => {
      const next = new Set(prev);
      if (next.has(job)) next.delete(job);
      else next.add(job);
      return next;
    });
  };

  const runMutation = useMutation({
    mutationFn: (jobName: string) =>
      api<{ ok: boolean; jobId: string; name: string }>(`/api/admin/jobs/${encodeURIComponent(jobName)}/run`, { method: "POST" }),
    onSuccess: (_, jobName) => {
      showToast({ text: `Đã xếp hàng chạy "${JOB_LABELS[jobName] ?? jobName}".`, tone: "success" });
      setConfirmJob(null);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: adminKeys.overview });
        onRefresh?.();
      }, 2500);
    },
    onError: (err, jobName) => {
      showToast({ text: `Không thể chạy "${JOB_LABELS[jobName] ?? jobName}": ${getErrorMessage(err)}`, tone: "danger" });
      setConfirmJob(null);
    },
  });

  const handleTriggerClick = (jobName: string) => {
    if (HEAVY_JOBS.has(jobName)) setConfirmJob(jobName);
    else runMutation.mutate(jobName);
  };

  const emptyTitle =
    jobFilter === "failing" ? "Không có job nào lỗi"
    : jobFilter === "running" ? "Không có job nào đang chạy"
    : jobFilter === "stuck" ? "Không có job nào bị treo"
    : "Không có job phù hợp";

  const emptyHint =
    jobFilter === "failing" ? "Tất cả các job đang chạy ổn định."
    : jobFilter === "running" ? "Worker hiện đang ở trạng thái rảnh."
    : jobFilter === "stuck" ? "Không có job nào vượt quá thời gian cho phép."
    : "Thử đổi bộ lọc sang tất cả.";

  return (
    <Card className="lg:col-span-2" id="jobs">
      <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Job nền
        </CardTitle>
        <JobFilterTabs filter={jobFilter} onChange={setJobFilter} counts={counts} />
      </CardHeader>

      <CardContent>
        {toastMessage && (
          <div
            className={cn(
              "mb-3 flex items-center gap-2 rounded-md border p-2.5 text-xs transition-opacity duration-200",
              toastMessage.tone === "success"
                ? "border-success/20 bg-success/10 text-success"
                : "border-destructive/20 bg-destructive/10 text-destructive"
            )}
            role="status"
          >
            {toastMessage.tone === "success" ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />}
            <span>{toastMessage.text}</span>
          </div>
        )}

        {isLoading ? (
          <ListSkeleton rows={6} />
        ) : jobs.length === 0 ? (
          <EmptyState icon={ListChecks} title="Chưa có job nào chạy" hint="Worker sẽ ghi nhận job sau lần chạy đầu tiên." />
        ) : rows.length === 0 ? (
          <EmptyState icon={ListChecks} title={emptyTitle} hint={emptyHint} />
        ) : isDesktop ? (
          <Table>
            <JobTableHeader />
            <TableBody>
              {rows.map((row) => (
                <JobTableRow
                  key={row.job}
                  row={row}
                  isExpanded={expandedJobKeys.has(row.job)}
                  isTriggerPending={runMutation.isPending && runMutation.variables === row.job}
                  onToggleExpand={() => toggleJobExpanded(row.job)}
                  onTrigger={() => handleTriggerClick(row.job)}
                />
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="divide-y text-sm">
            {rows.map((row) => (
              <JobMobileItem
                key={row.job}
                row={row}
                isExpanded={expandedJobKeys.has(row.job)}
                isTriggerPending={runMutation.isPending && runMutation.variables === row.job}
                onToggleExpand={() => toggleJobExpanded(row.job)}
                onTrigger={() => handleTriggerClick(row.job)}
              />
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmJob !== null}
        onOpenChange={(open) => !open && setConfirmJob(null)}
        title={`Chạy job ${confirmJob ? JOB_LABELS[confirmJob] ?? confirmJob : ""}?`}
        description={getJobConfirmDescription(confirmJob)}
        confirmLabel="Chạy ngay"
        cancelLabel="Hủy"
        pending={runMutation.isPending}
        onConfirm={() => {
          if (confirmJob) runMutation.mutate(confirmJob);
        }}
      />
    </Card>
  );
}
