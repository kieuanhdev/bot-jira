"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, Clock, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StandardizationTask } from "./lib/stale-types";
import { buildMissingBulkFields } from "./lib/stale-utils";

export function BulkStandardizationAction({
  selectedKeys,
  allTasks,
  incompleteCount,
  onFilterToSingleProject,
}: {
  selectedKeys: Set<string>;
  allTasks: StandardizationTask[];
  incompleteCount: number;
  onFilterToSingleProject?: (projectKey: string) => void;
}) {
  const selectedTasksList = useMemo(
    () => allTasks.filter((t) => selectedKeys.has(t.jiraKey)),
    [allTasks, selectedKeys]
  );
  const selectedProjects = useMemo(
    () => Array.from(new Set(selectedTasksList.map((t) => t.projectKey))),
    [selectedTasksList]
  );
  const isMultiProject = selectedProjects.length > 1;
  const projectParam = selectedProjects.length === 1 ? `project=${encodeURIComponent(selectedProjects[0])}&` : "";

  const allOnlyMissWorklog =
    selectedTasksList.length > 0 &&
    selectedTasksList.every((t) => t.missing.length === 1 && t.missing[0] === "WORKLOG");
  const hasAnyMissWorklog = selectedTasksList.some((t) => t.missing.includes("WORKLOG"));
  const hasAnyMissMetadata = selectedTasksList.some((t) => t.missing.some((m) => m !== "WORKLOG"));

  const metadataFields = buildMissingBulkFields(selectedKeys, allTasks);
  const selectedKeysCsv = Array.from(selectedKeys).join(",");
  const worklogKeysCsv = selectedTasksList
    .filter((t) => t.missing.includes("WORKLOG"))
    .map((t) => t.jiraKey)
    .join(",");

  if (selectedKeys.size === 0) {
    if (incompleteCount === 0) return null;
    const firstProject = allTasks[0]?.projectKey;
    const sameProjectTasks = allTasks
      .filter((t) => !firstProject || t.projectKey === firstProject)
      .slice(0, 20);
    const pParam = firstProject ? `project=${encodeURIComponent(firstProject)}&` : "";
    const allFirstProjectOnlyWorklog =
      sameProjectTasks.length > 0 &&
      sameProjectTasks.every((t) => t.missing.length === 1 && t.missing[0] === "WORKLOG");

    return (
      <Button
        asChild
        className="cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm"
      >
        <Link
          href={
            allFirstProjectOnlyWorklog
              ? `/bulk?${pParam}keys=${sameProjectTasks.map((t) => t.jiraKey).join(",")}&action=log-work&returnTo=standardization`
              : `/bulk?${pParam}keys=${sameProjectTasks.map((t) => t.jiraKey).join(",")}&fields=points,estimate,fixVersions,dueDate&returnTo=standardization`
          }
        >
          {allFirstProjectOnlyWorklog ? (
            <Clock className="h-4 w-4 mr-1.5" aria-hidden />
          ) : (
            <ListChecks className="h-4 w-4 mr-1.5" aria-hidden />
          )}
          {allFirstProjectOnlyWorklog ? "Ghi Worklog hàng loạt" : "Chuẩn hóa hàng loạt"} (
          {Math.min(sameProjectTasks.length, incompleteCount)})
        </Link>
      </Button>
    );
  }

  if (isMultiProject) {
    return (
      <div className="flex flex-col gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md p-2.5">
        <span className="font-semibold flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Đã chọn task từ {selectedProjects.length} dự án ({selectedProjects.join(", ")})
        </span>
        <span>Thao tác hàng loạt chỉ hỗ trợ một dự án tại một thời điểm.</span>
        {onFilterToSingleProject && (
          <button
            type="button"
            onClick={() => onFilterToSingleProject(selectedProjects[0])}
            className="cursor-pointer text-left underline font-medium hover:text-amber-800 dark:hover:text-amber-300"
          >
            Chỉ chọn các task dự án {selectedProjects[0]}
          </button>
        )}
      </div>
    );
  }

  if (allOnlyMissWorklog) {
    return (
      <Button
        asChild
        className="cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm"
      >
        <Link
          href={`/bulk?${projectParam}keys=${selectedKeysCsv}&action=log-work&returnTo=standardization`}
        >
          <Clock className="h-4 w-4 mr-1.5" aria-hidden />
          Ghi Worklog đã chọn ({selectedKeys.size})
        </Link>
      </Button>
    );
  }

  if (!hasAnyMissWorklog) {
    return (
      <Button
        asChild
        className="cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm"
      >
        <Link
          href={`/bulk?${projectParam}keys=${selectedKeysCsv}&fields=${metadataFields}&returnTo=standardization`}
        >
          <ListChecks className="h-4 w-4 mr-1.5" aria-hidden />
          Chuẩn hóa đã chọn ({selectedKeys.size})
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm inline-flex items-center gap-1.5">
          <ListChecks className="h-4 w-4" aria-hidden />
          Chuẩn hóa đã chọn ({selectedKeys.size})
          <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Chọn loại thao tác cho {selectedKeys.size} task:
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hasAnyMissMetadata && (
          <DropdownMenuItem asChild className="cursor-pointer py-2">
            <Link
              href={`/bulk?${projectParam}keys=${selectedKeysCsv}&fields=${metadataFields}&returnTo=standardization`}
              className="flex items-center gap-2"
            >
              <ListChecks className="h-4 w-4 text-primary shrink-0" aria-hidden />
              <div>
                <p className="font-medium text-xs">Cập nhật trường dữ liệu</p>
                <p className="text-[11px] text-muted-foreground">Points, Estimate, Due date, Fix Version...</p>
              </div>
            </Link>
          </DropdownMenuItem>
        )}
        {hasAnyMissWorklog && (
          <DropdownMenuItem asChild className="cursor-pointer py-2">
            <Link
              href={`/bulk?${projectParam}keys=${worklogKeysCsv}&action=log-work&returnTo=standardization`}
              className="flex items-center gap-2"
            >
              <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden />
              <div>
                <p className="font-medium text-xs">Ghi Worklog hàng loạt</p>
                <p className="text-[11px] text-muted-foreground">
                  Ghi thời gian cho {selectedTasksList.filter((t) => t.missing.includes("WORKLOG")).length} task thiếu worklog
                </p>
              </div>
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
