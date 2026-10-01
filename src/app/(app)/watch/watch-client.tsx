"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getErrorMessage } from "@/lib/api-client";
import { watchKeys } from "@/lib/query-keys";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { Eye } from "lucide-react";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncState, ErrorState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";
import { GridSkeleton } from "@/components/shared/skeleton";

type Watched = {
  jiraKey: string;
  summary: string;
  status: string;
  assigneeJira: string | null;
  points: number | null;
  labels: string[];
  updatedAt: string | null;
  watchedAt: string;
};

export function WatchClient() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: watchKeys.all,
    queryFn: () => api<{ items: Watched[] }>("/api/watch"),
    refetchInterval: 30000,
    retry: 1,
  });

  async function unwatch(key: string) {
    await api(`/api/issues/${key}/watch`, { method: "POST", body: {} });
    qc.invalidateQueries({ queryKey: watchKeys.all });
  }

  const items = data?.items ?? [];

  return (
    <PageContainer size="wide">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Đang theo dõi"
          description="Các task bạn theo dõi. Bạn sẽ nhận thông báo khi task thay đổi hoặc có bình luận mới."
        />

        <AsyncState
          loading={isLoading}
          error={error}
          empty={items.length === 0}
          loadingFallback={<GridSkeleton count={4} />}
          errorFallback={
            <ErrorState
              title="Không thể tải danh sách theo dõi"
              message={getErrorMessage(error)}
              onRetry={() => refetch()}
            />
          }
          emptyFallback={
            <EmptyState
              icon={Eye}
              title="Chưa theo dõi task nào"
              hint="Mở một task và bấm “Theo dõi” để nhận thông báo khi có cập nhật hoặc bình luận mới."
            />
          }
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {items.map((w) => (
              <Card key={w.jiraKey}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/issue/${w.jiraKey}`} className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{w.jiraKey}</span>
                        <Badge>{w.status}</Badge>
                        {w.points != null && <Badge variant="secondary">{w.points} điểm</Badge>}
                      </div>
                      <p className="mt-1 line-clamp-1 font-medium">{w.summary}</p>
                    </Link>
                    <Button variant="ghost" size="icon" onClick={() => unwatch(w.jiraKey)} aria-label="Bỏ theo dõi">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{w.assigneeJira ?? "chưa phân công"}</span>
                    <span>· cập nhật {timeAgo(w.updatedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </AsyncState>
      </div>
    </PageContainer>
  );
}
