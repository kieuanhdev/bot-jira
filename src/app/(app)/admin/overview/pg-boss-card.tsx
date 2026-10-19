"use client";

import * as React from "react";
import { ServerCog } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton } from "@/components/shared/skeleton";
import { ErrorState } from "@/components/shared/async-state";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

export type QueueMetric = {
  name: string;
  queuedCount: number;
  readyCount: number;
  activeCount: number;
  failedCount: number;
  history?: Array<{
    time: string;
    completed: number;
    failed: number;
    active: number;
    ready: number;
  }>;
};

export function PgBossCard({
  queues,
  isLoading,
}: {
  queues?: QueueMetric[] | null;
  isLoading?: boolean;
}) {
  return (
    <Card id="pg-boss-queues">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ServerCog className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Hàng đợi pg-boss
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : queues === null ? (
          <ErrorState
            title="Không thể đọc hàng đợi pg-boss"
            message="Không thể kết nối hoặc truy vấn bảng pg-boss lúc này."
          />
        ) : !queues || queues.length === 0 ? (
          <EmptyState
            icon={ServerCog}
            title="Chưa có hàng đợi nào"
            hint="Các hàng đợi pg-boss sẽ xuất hiện khi worker bắt đầu xử lý."
          />
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Queue</TableHead>
                  <TableHead className="w-20 text-center">Chờ</TableHead>
                  <TableHead className="w-24 text-center">Đang chạy</TableHead>
                  <TableHead className="w-20 text-center">Tồn</TableHead>
                  <TableHead className="w-20 text-right">Lỗi</TableHead>
                  <TableHead className="w-24 text-center">Xu hướng (24h)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queues.map((q) => {
                  const isHighPending = q.readyCount > 50;
                  const hasFailed = q.failedCount > 0;
                  const history = q.history ?? [];
                  const hasFailedHistory = history.some((h) => h.failed > 0);

                  return (
                    <TableRow
                      key={q.name}
                      className={cn(
                        hasFailed && "bg-destructive/[0.03]",
                        isHighPending && !hasFailed && "bg-warning/[0.03]"
                      )}
                    >
                      <TableCell className="py-2 font-mono text-xs font-medium text-foreground">
                        {q.name}
                      </TableCell>
                      <TableCell className="py-2 text-center tabular-nums text-xs">
                        {isHighPending ? (
                          <Badge variant="warning">{q.readyCount}</Badge>
                        ) : (
                          <span className={cn(q.readyCount > 0 && "font-semibold")}>
                            {q.readyCount}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-center tabular-nums text-xs">
                        {q.activeCount > 0 ? (
                          <Badge variant="info">{q.activeCount}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-center tabular-nums text-xs text-muted-foreground">
                        {q.queuedCount}
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-xs">
                        {hasFailed ? (
                          <Badge variant="danger">{q.failedCount}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-center text-xs">
                        <Sparkline
                          data={history.map((h) => h.completed)}
                          width={72}
                          height={18}
                          minPoints={4}
                          unit="xong"
                          tone={hasFailedHistory ? "amber" : "teal"}
                          ariaLabel={`Xu hướng hoàn thành 24h của hàng đợi ${q.name}`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
