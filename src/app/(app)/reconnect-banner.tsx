"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { AlertTriangle, ArrowRight } from "lucide-react";

type Integrations = {
  jira: { linked: boolean; status: { ok: boolean; detail?: string } };
  bitbucket: { linked: boolean; status: { ok: boolean; detail?: string } };
};

/**
 * Reconnect Banner: Alerts user when their personal Jira credential fails validation (401/403/revoked),
 * providing an immediate link to re-enter their token without logging them out or losing local context.
 */
export function ReconnectBanner() {
  const { data } = useQuery<Integrations>({
    queryKey: ["me-integrations"],
    queryFn: () => api<Integrations>("/api/me/integrations"),
    staleTime: 60_000,
    retry: 0,
  });

  if (!data?.jira.linked || data.jira.status.ok) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 border-b border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
      role="alert"
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate font-medium">
          Kết nối Jira của bạn đã hết hạn hoặc bị từ chối truy cập. Các thao tác cập nhật task tạm thời bị chặn.
        </span>
      </div>
      <Link
        href="/settings"
        className="flex shrink-0 items-center gap-1 text-xs font-semibold underline underline-offset-4 hover:opacity-80 transition-opacity cursor-pointer"
      >
        <span>Cập nhật token</span>
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
