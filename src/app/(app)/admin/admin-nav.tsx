"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bug, RefreshCcw } from "lucide-react";
import { api } from "@/lib/api-client";
import { adminKeys } from "@/lib/query-keys";
import type { AdminProjectSyncRow } from "@/lib/admin/project-sync";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Tổng quan", icon: Activity, exact: true },
  { href: "/admin/sync", label: "Đồng bộ dự án", icon: RefreshCcw, exact: false },
  { href: "/admin/sentry", label: "Duyệt lỗi Sentry", icon: Bug, exact: false },
];

export function AdminNav() {
  const pathname = usePathname() ?? "";
  const { data } = useQuery({
    queryKey: adminKeys.projects,
    queryFn: () => api<{ items: AdminProjectSyncRow[]; generatedAt: string }>("/api/admin/projects"),
    staleTime: 15_000,
  });

  const failedCount = data?.items?.filter((p) => p.state === "failed").length ?? 0;

  const { data: sentry } = useQuery({
    queryKey: adminKeys.sentryList("review"),
    queryFn: () => api<{ counts: Record<string, number> }>("/api/admin/sentry-import?state=review"),
    staleTime: 15_000,
  });
  const reviewCount = sentry?.counts?.review ?? 0;

  return (
    <nav aria-label="Điều hướng quản trị" className="flex gap-1 overflow-x-auto border-b">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const hasFailedBadge = item.href === "/admin/sync" && failedCount > 0;
        const hasReviewBadge = item.href === "/admin/sentry" && reviewCount > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" aria-hidden="true" />
            <span>{item.label}</span>
            {hasFailedBadge && (
              <span
                className="ml-1 inline-flex items-center justify-center rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-rose-600 dark:text-rose-400"
                aria-label={`${failedCount} dự án lỗi`}
              >
                {failedCount}
              </span>
            )}
            {hasReviewBadge && (
              <span
                className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-400"
                aria-label={`${reviewCount} issue Sentry chờ duyệt`}
              >
                {reviewCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
