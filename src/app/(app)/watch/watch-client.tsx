"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/utils";
import { Eye } from "lucide-react";

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
  const { data, isLoading } = useQuery({
    queryKey: ["watch"],
    queryFn: () => api<{ items: Watched[] }>("/api/watch"),
    refetchInterval: 30000,
    retry: 1,
  });

  async function unwatch(key: string) {
    await api(`/api/issues/${key}/watch`, { method: "POST", body: {} });
    qc.invalidateQueries({ queryKey: ["watch"] });
  }

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Đang theo dõi</h1>
        <p className="text-sm text-muted-foreground">
          Các task bạn theo dõi. Bạn sẽ nhận thông báo khi task thay đổi hoặc có bình luận mới.
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="mt-2 h-4 w-3/4" />
                <Skeleton className="mt-3 h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Eye className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Chưa theo dõi task nào</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Mở một task và bấm “Theo dõi” để nhận thông báo khi có cập nhật hoặc bình luận mới.
            </p>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
