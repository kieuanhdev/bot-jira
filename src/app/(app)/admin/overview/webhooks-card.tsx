"use client";

import * as React from "react";
import { Webhook, Radio } from "lucide-react";
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
import { timeAgo, cn } from "@/lib/utils";

export type WebhookSourceMetric = {
  source: string;
  count24h: number;
  unprocessed: number;
  errors24h: number;
  lastReceivedAt: string | null;
};

const SOURCE_LABELS: Record<string, string> = {
  jira: "Jira Webhook",
  bitbucket: "Bitbucket Webhook",
  github: "GitHub Webhook",
  sentry: "Sentry Webhook",
};

export function WebhooksCard({
  webhooks = {},
  isLoading,
}: {
  webhooks?: Record<string, WebhookSourceMetric>;
  isLoading?: boolean;
}) {
  const sources = Object.values(webhooks);

  const now = React.useSyncExternalStore(
    (cb) => {
      const id = setInterval(cb, 15_000);
      return () => clearInterval(id);
    },
    () => Date.now(),
    () => 0
  );

  return (
    <Card id="webhooks">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Webhook className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Webhook tích hợp (24h qua)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ListSkeleton rows={3} />
        ) : sources.length === 0 ? (
          <EmptyState
            icon={Radio}
            title="Chưa có dữ liệu webhook"
            hint="Các sự kiện webhook nhận được sẽ hiển thị ở đây."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nguồn</TableHead>
                <TableHead className="w-20 text-center">24h qua</TableHead>
                <TableHead className="w-24 text-center">Chưa xử lý</TableHead>
                <TableHead className="w-20 text-center">Lỗi</TableHead>
                <TableHead className="w-32">Nhận gần nhất</TableHead>
                <TableHead className="w-24 text-right">Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((w) => {
                const label = SOURCE_LABELS[w.source] ?? w.source;
                const ageMs = w.lastReceivedAt && now > 0 ? now - new Date(w.lastReceivedAt).getTime() : null;
                const isSilent = ageMs === null || ageMs > 24 * 3600_000;
                const hasErrors = w.errors24h > 0;
                const hasUnprocessed = w.unprocessed > 0;

                return (
                  <TableRow key={w.source} className={cn(hasErrors && "bg-rose-500/[0.03]")}>
                    <TableCell className="py-2.5">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{label}</span>
                        <span className="font-mono text-xs text-muted-foreground">{w.source}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 text-center tabular-nums font-semibold">
                      {w.count24h.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="py-2.5 text-center tabular-nums">
                      {hasUnprocessed ? (
                        <Badge variant="warning">{w.unprocessed}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 text-center tabular-nums">
                      {hasErrors ? (
                        <Badge variant="danger">{w.errors24h}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-muted-foreground">
                      {w.lastReceivedAt ? timeAgo(w.lastReceivedAt) : "chưa từng"}
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      {isSilent ? (
                        <Badge variant="warning" className="text-[11px]">
                          Im lặng
                        </Badge>
                      ) : (
                        <Badge variant="success" className="text-[11px]">
                          Bình thường
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
