"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { issuesKeys } from "@/lib/query-keys";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link2, AlertTriangle, AlertCircle, ArrowRight } from "lucide-react";

export type DependencyItem = {
  key: string;
  depth: number;
  relation: "explicit" | "dependency";
  via?: string;
  rootKey?: string;
  summary: string;
  status: string;
  statusCategory: string;
  priority: string;
  projectKey: string;
  fixVersionIds: string[];
  fixVersionNames: string[];
  lastSyncedAt: string | null;
};

export type DependencyResponse = {
  roots: string[];
  issues: DependencyItem[];
  edges: Array<{ root: string; dependency: string }>;
  cycles: Array<{ path: string[] }>;
  truncated: boolean;
  missingKeys: string[];
};

export function IssueDependencies({
  jiraKey,
  rootProjectKey,
  rootFixVersionNames = [],
}: {
  jiraKey: string;
  rootProjectKey?: string;
  rootFixVersionNames?: string[];
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: issuesKeys.dependencies(jiraKey),
    queryFn: () => api<DependencyResponse>(`/api/issues/${jiraKey}/dependencies`),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Task phụ thuộc (is blocked by)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-3/4 rounded-md" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Task phụ thuộc (is blocked by)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Không thể tải danh sách task phụ thuộc: {(error as Error)?.message || "Lỗi không xác định"}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const dependencies = (data?.issues ?? []).filter((i) => i.relation === "dependency");
  const cycles = data?.cycles ?? [];
  const truncated = Boolean(data?.truncated);
  const currentProject = rootProjectKey ?? jiraKey.split("-")[0];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>Task phụ thuộc ({dependencies.length})</span>
        </CardTitle>
        {dependencies.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Luồng phụ thuộc: Task con/phần việc ➔ {jiraKey}
          </span>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {cycles.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">Phát hiện vòng lặp phụ thuộc (Cycle)!</p>
              <div className="text-xs opacity-90">
                {cycles.map((c, idx) => (
                  <div key={idx} className="font-mono">
                    {c.path.join(" ➔ ")}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {truncated && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Đồ thị dependency vượt giới hạn hiển thị tối đa (đã cắt ngắn kết quả).</span>
          </div>
        )}

        {dependencies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Link2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium">Không có task phụ thuộc</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Task này không có liên kết is blocked by.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-md border">
            {dependencies.map((dep) => {
              const isOtherProject = dep.projectKey && dep.projectKey !== currentProject;
              const isMissingVersion =
                rootFixVersionNames.length > 0 &&
                !dep.fixVersionNames.some((v) => rootFixVersionNames.includes(v));

              return (
                <div
                  key={dep.key}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/40"
                  style={{ paddingLeft: `${Math.min(dep.depth * 16, 48) + 12}px` }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/issue/${dep.key}`}
                        className="font-mono text-sm font-medium text-primary hover:underline cursor-pointer"
                      >
                        {dep.key}
                      </Link>
                      <Badge variant="outline" className="text-xs">
                        {dep.depth === 1 ? "Trực tiếp" : `Cấp ${dep.depth}`}
                      </Badge>
                      {isOtherProject && (
                        <Badge variant="secondary" className="text-xs">
                          Project khác ({dep.projectKey})
                        </Badge>
                      )}
                      {dep.status && (
                        <Badge
                          variant={
                            dep.statusCategory === "done"
                              ? "success"
                              : dep.statusCategory === "indeterminate"
                              ? "info"
                              : "outline"
                          }
                          className="text-xs"
                        >
                          {dep.status}
                        </Badge>
                      )}
                      {isMissingVersion && !isOtherProject && (
                        <Badge variant="warning" className="text-xs">
                          Thiếu version
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-foreground truncate">
                      {dep.summary || <span className="text-muted-foreground italic">(Chưa có summary)</span>}
                    </p>
                    {dep.via && dep.via !== jiraKey && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <span>qua</span>
                        <Link href={`/issue/${dep.via}`} className="font-mono hover:underline">
                          {dep.via}
                        </Link>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:self-center">
                    {dep.fixVersionNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {dep.fixVersionNames.map((v) => (
                          <Badge key={v} variant="outline" className="text-xs font-mono">
                            {v}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Chưa gán version</span>
                    )}
                    <Link
                      href={`/issue/${dep.key}`}
                      className="p-1 text-muted-foreground hover:text-foreground cursor-pointer rounded transition-colors"
                      title="Mở chi tiết task"
                    >
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
