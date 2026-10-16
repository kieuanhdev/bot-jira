"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { History, ShieldCheck } from "lucide-react";
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
import { api } from "@/lib/api-client";
import { adminKeys } from "@/lib/query-keys";
import { timeAgo } from "@/lib/utils";
import { getAuditActionLabel } from "./format-stats";

type AuditEntry = {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  action: string;
  target: string | null;
  source: string | null;
};

export function AuditCard() {
  const { data, isLoading } = useQuery({
    queryKey: adminKeys.audit,
    queryFn: () => api<{ items: AuditEntry[] }>("/api/admin/audit?limit=20"),
    staleTime: 60_000,
  });

  const items = data?.items ?? [];

  return (
    <Card id="admin-audit">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Hoạt động admin gần đây
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Chưa có nhật ký hoạt động"
            hint="Các hành động của admin sẽ được ghi nhận tại đây."
          />
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Thời gian</TableHead>
                  <TableHead>Người thực hiện</TableHead>
                  <TableHead>Hành động</TableHead>
                  <TableHead>Mục tiêu</TableHead>
                  <TableHead className="w-20 text-right">Nguồn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {timeAgo(log.createdAt)}
                    </TableCell>
                    <TableCell className="py-2 text-xs font-medium text-foreground">
                      {log.actorEmail ?? "Hệ thống"}
                    </TableCell>
                    <TableCell className="py-2 text-xs">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {getAuditActionLabel(log.action)}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {log.action}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-xs font-mono text-muted-foreground">
                      {log.target ?? "—"}
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {log.source ?? "web"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
