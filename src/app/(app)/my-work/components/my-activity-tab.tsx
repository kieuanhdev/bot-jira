"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { myWorkKeys } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { History, Globe, Shield, MousePointerClick, Clock } from "lucide-react";

export function MyActivityTab() {
  const { data, isLoading } = useQuery<{
    items: Array<{
      id: string;
      eventType: string;
      action: string;
      description?: string | null;
      path: string;
      createdAt: string;
    }>;
  }>({
    queryKey: myWorkKeys.activity(1),
    queryFn: () => api("/api/my-work/activity?limit=25"),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-3 rounded-lg border border-border bg-card flex items-center justify-between">
            <div className="space-y-1.5 w-2/3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    );
  }

  const items = data?.items || [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Chưa có lịch sử hoạt động"
        hint="Các thao tác điều hướng, đổi trạng thái task hay tương tác của bạn sẽ được ghi nhận tại đây."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border flex items-center justify-between">
        <span>Nhật ký các thao tác và truy cập gần đây của bạn trong phiên làm việc.</span>
        <span className="font-semibold text-foreground">{items.length} sự kiện gần nhất</span>
      </div>

      <div className="space-y-2">
        {items.map((act) => {
          const isAuth = act.eventType === "auth";
          const isAction = act.eventType === "action";
          const Icon = isAuth ? Shield : isAction ? MousePointerClick : Globe;

          return (
            <div
              key={act.id}
              className="p-3 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-full shrink-0 ${
                    isAuth
                      ? "bg-warning/10 text-warning"
                      : isAction
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">
                      {act.action}
                    </span>
                    <Badge
                      variant={isAuth ? "warning" : isAction ? "primary-soft" : "neutral"}
                      className="text-2xs"
                    >
                      {act.eventType}
                    </Badge>
                  </div>
                  {act.description && (
                    <p className="text-2xs text-muted-foreground">{act.description}</p>
                  )}
                  <span className="text-2xs font-mono text-muted-foreground/80">{act.path}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-2xs text-muted-foreground self-end sm:self-center shrink-0">
                <Clock className="w-3 h-3" aria-hidden="true" />
                <span>{new Date(act.createdAt).toLocaleString("vi-VN")}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
