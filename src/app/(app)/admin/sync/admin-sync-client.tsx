"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  DatabaseZap,
  FolderSync,
  Loader2,
  MoreHorizontal,
  PauseCircle,
  Play,
  RefreshCw,
} from "lucide-react";
import { api, getErrorMessage } from "@/lib/api-client";
import { adminKeys, boardKeys } from "@/lib/query-keys";
import { maskSecrets } from "@/lib/admin/mask-secrets";
import { cn, timeAgo } from "@/lib/utils";
import type { AdminProjectSyncRow, AdminSyncState } from "@/lib/admin/project-sync";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { MetricGrid } from "@/components/shared/metric-grid";
import { SearchField } from "@/components/shared/search-field";
import { AsyncState, ErrorState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton } from "@/components/shared/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATE_BADGE: Record<AdminSyncState, { label: string; variant: "success" | "warning" | "danger" | "info" | "secondary" }> = {
  ok: { label: "Ổn định", variant: "success" },
  running: { label: "Đang đồng bộ", variant: "info" },
  failed: { label: "Lỗi", variant: "danger" },
  never: { label: "Chưa đồng bộ", variant: "secondary" },
  disabled: { label: "Đã tắt", variant: "warning" },
};

type Pending =
  | { kind: "disable"; key: string }
  | { kind: "disable-all" }
  | { kind: "full"; key: string }
  | null;

type Feedback = { tone: "success" | "destructive" | "info"; text: string } | null;

function SyncSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform duration-150 motion-reduce:transition-none",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

const STATE_PRIORITY: Record<AdminSyncState, number> = {
  failed: 1,
  running: 2,
  never: 3,
  ok: 4,
  disabled: 5,
};

export function AdminSyncClient() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState<"all" | "enabled" | "disabled" | "failed">("all");
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const toggleError = (key: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: adminKeys.projects,
    queryFn: () => api<{ items: AdminProjectSyncRow[]; generatedAt: string }>("/api/admin/projects"),
    refetchInterval: 15_000,
  });
  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = items;
    if (filterState === "enabled") {
      result = result.filter((p) => p.syncEnabled);
    } else if (filterState === "disabled") {
      result = result.filter((p) => !p.syncEnabled);
    } else if (filterState === "failed") {
      result = result.filter((p) => p.state === "failed");
    }

    if (q) {
      result = result.filter((p) => p.key.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
    }

    return [...result].sort((a, b) => {
      const aPri = !a.syncEnabled ? 5 : (STATE_PRIORITY[a.state] ?? 4);
      const bPri = !b.syncEnabled ? 5 : (STATE_PRIORITY[b.state] ?? 4);
      if (aPri !== bPri) return aPri - bPri;
      return a.key.localeCompare(b.key);
    });
  }, [items, search, filterState]);

  const counts = useMemo(
    () => ({
      total: items.length,
      enabled: items.filter((p) => p.syncEnabled).length,
      disabled: items.filter((p) => !p.syncEnabled).length,
      failed: items.filter((p) => p.state === "failed").length,
    }),
    [items]
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: adminKeys.projects });
    void qc.invalidateQueries({ queryKey: boardKeys.projects });
  };

  const toggleOne = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      api<{ key: string; syncEnabled: boolean; syncJobId: string | null }>(
        `/api/admin/projects/${encodeURIComponent(key)}`,
        { method: "PATCH", body: { syncEnabled: enabled } }
      ),
    onSuccess: (res) => {
      setFeedback({
        tone: "success",
        text: res.syncEnabled
          ? `Đã bật đồng bộ ${res.key}${res.syncJobId ? " và xếp hàng đồng bộ bù phần dữ liệu bị lỡ." : "."}`
          : `Đã tắt đồng bộ ${res.key}. Lượt đồng bộ đang chạy (nếu có) sẽ chạy nốt, sau đó dừng hẳn.`,
      });
      setPending(null);
      invalidate();
    },
    onError: (e) => setFeedback({ tone: "destructive", text: getErrorMessage(e) }),
  });

  const toggleAll = useMutation({
    mutationFn: (enabled: boolean) =>
      api<{ syncEnabled: boolean; changed: string[] }>("/api/admin/projects", {
        method: "PATCH",
        body: { syncEnabled: enabled },
      }),
    onSuccess: (res) => {
      setFeedback({
        tone: "success",
        text:
          res.changed.length === 0
            ? "Không có dự án nào cần thay đổi."
            : `${res.syncEnabled ? "Đã bật" : "Đã tắt"} đồng bộ ${res.changed.length} dự án: ${res.changed.join(", ")}.`,
      });
      setPending(null);
      invalidate();
    },
    onError: (e) => setFeedback({ tone: "destructive", text: getErrorMessage(e) }),
  });

  const syncNow = useMutation({
    mutationFn: ({ key, full }: { key?: string; full?: boolean }) =>
      api<{ state: "queued" | "already_running"; projectKey: string | null }>("/api/sync/jira", {
        method: "POST",
        body: { ...(key ? { projectKey: key } : {}), full: Boolean(full) },
      }),
    onSuccess: (res, vars) => {
      const target = vars.key ?? "tất cả dự án đang bật";
      setFeedback({
        tone: "info",
        text:
          res.state === "already_running"
            ? `${target} đang được đồng bộ.`
            : `Đã xếp hàng ${vars.full ? "đồng bộ toàn bộ" : "đồng bộ"} cho ${target}.`,
      });
      setPending(null);
      invalidate();
    },
    onError: (e) => setFeedback({ tone: "destructive", text: getErrorMessage(e) }),
  });

  const busyKey =
    (toggleOne.isPending && toggleOne.variables?.key) || (syncNow.isPending && syncNow.variables?.key) || null;
  const anyBusy = toggleOne.isPending || toggleAll.isPending || syncNow.isPending;

  function requestToggle(key: string, enabled: boolean) {
    setFeedback(null);
    if (enabled) toggleOne.mutate({ key, enabled });
    else setPending({ kind: "disable", key });
  }

  function confirmPending() {
    if (!pending) return;
    if (pending.kind === "disable") toggleOne.mutate({ key: pending.key, enabled: false });
    else if (pending.kind === "disable-all") toggleAll.mutate(false);
    else syncNow.mutate({ key: pending.key, full: true });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={FolderSync}
        title="Đồng bộ dự án"
        meta={data?.generatedAt ? `• cập nhật ${timeAgo(data.generatedAt)}` : undefined}
        description="Bật hoặc tắt đồng bộ Jira cho từng dự án. Dự án đã tắt sẽ không được đồng bộ dưới bất kỳ hình thức nào (lịch tự động, nút đồng bộ, webhook), dữ liệu cũ vẫn hiển thị trên board kèm cảnh báo."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer gap-1.5"
              disabled={anyBusy || counts.disabled === 0}
              onClick={() => {
                setFeedback(null);
                toggleAll.mutate(true);
              }}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              Bật tất cả
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer gap-1.5"
              disabled={anyBusy || counts.enabled === 0}
              onClick={() => {
                setFeedback(null);
                setPending({ kind: "disable-all" });
              }}
            >
              <PauseCircle className="h-4 w-4" aria-hidden="true" />
              Tắt tất cả
            </Button>
            <Button
              size="sm"
              className="cursor-pointer gap-1.5"
              disabled={anyBusy || counts.enabled === 0}
              onClick={() => {
                setFeedback(null);
                syncNow.mutate({});
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Đồng bộ tất cả
            </Button>
          </>
        }
      />

      <MetricGrid columns={4}>
        <MetricCard
          label="Dự án"
          value={counts.total}
          icon={FolderSync}
          loading={isLoading}
          onClick={() => setFilterState("all")}
          selected={filterState === "all"}
        />
        <MetricCard
          label="Đang bật"
          value={counts.enabled}
          icon={CheckCircle2}
          tone="success"
          loading={isLoading}
          onClick={() => setFilterState((prev) => (prev === "enabled" ? "all" : "enabled"))}
          selected={filterState === "enabled"}
        />
        <MetricCard
          label="Đã tắt"
          value={counts.disabled}
          icon={PauseCircle}
          tone="warning"
          loading={isLoading}
          onClick={() => setFilterState((prev) => (prev === "disabled" ? "all" : "disabled"))}
          selected={filterState === "disabled"}
        />
        <MetricCard
          label="Đang lỗi"
          value={counts.failed}
          icon={AlertTriangle}
          tone="danger"
          loading={isLoading}
          onClick={() => setFilterState((prev) => (prev === "failed" ? "all" : "failed"))}
          selected={filterState === "failed"}
        />
      </MetricGrid>

      {feedback && <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Tìm theo mã hoặc tên dự án"
          ariaLabel="Tìm dự án"
          className="w-full sm:w-72"
        />
        {isFetching && !isLoading && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Đang làm mới
          </span>
        )}
      </div>

      <AsyncState
        loading={isLoading}
        error={error}
        empty={filtered.length === 0}
        loadingFallback={<ListSkeleton rows={6} />}
        errorFallback={
          <ErrorState title="Không thể tải danh sách dự án" message={getErrorMessage(error)} onRetry={() => refetch()} />
        }
        emptyFallback={
          <EmptyState
            icon={DatabaseZap}
            title={items.length === 0 ? "Chưa có dự án nào" : "Không có dự án phù hợp"}
            hint={
              items.length === 0
                ? "Dự án sẽ xuất hiện khi được thêm vào catalog Jira."
                : filterState !== "all"
                  ? "Thử xoá bộ lọc hoặc đổi từ khoá."
                  : "Thử từ khoá khác."
            }
          />
        }
      >
        <Card className="overflow-hidden">
          <ul className="divide-y">
            {filtered.map((p) => {
              const badge = STATE_BADGE[p.state];
              const rowBusy = busyKey === p.key;
              const hasExpandedError = expandedErrors.has(p.key);
              return (
                <li
                  key={p.key}
                  className={cn(
                    "flex flex-col gap-3 p-4 transition-colors duration-150 sm:flex-row sm:items-center",
                    !p.syncEnabled && "bg-muted/30"
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{p.key}</span>
                      <span className="truncate text-sm text-muted-foreground">{p.name}</span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{p.issueCount.toLocaleString("vi-VN")} issue</span>
                      <span>· thành công {p.lastSuccessAt ? timeAgo(p.lastSuccessAt) : "chưa từng"}</span>
                      {p.lastStartedAt && <span>· chạy gần nhất {timeAgo(p.lastStartedAt)}</span>}
                    </div>
                    {p.state === "failed" && p.lastError && (
                      <div className="mt-1">
                        <button
                          type="button"
                          onClick={() => toggleError(p.key)}
                          className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-destructive transition-colors hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          aria-expanded={hasExpandedError}
                        >
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 transition-transform duration-150 motion-reduce:transition-none",
                              hasExpandedError && "rotate-90"
                            )}
                            aria-hidden="true"
                          />
                          <span>{hasExpandedError ? "Ẩn chi tiết lỗi" : "Xem chi tiết lỗi"}</span>
                        </button>
                        {hasExpandedError && (
                          <pre className="mt-1.5 max-h-48 overflow-x-auto whitespace-pre-wrap rounded bg-destructive/10 p-2 font-mono text-xs text-destructive">
                            {maskSecrets(p.lastError)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Desktop direct action buttons */}
                    <div className="hidden items-center gap-2 sm:flex">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer gap-1.5"
                        disabled={!p.syncEnabled || anyBusy}
                        onClick={() => {
                          setFeedback(null);
                          syncNow.mutate({ key: p.key });
                        }}
                      >
                        <RefreshCw
                          className={cn("h-4 w-4", rowBusy && syncNow.isPending && "animate-spin motion-reduce:animate-none")}
                          aria-hidden="true"
                        />
                        Đồng bộ
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer"
                        disabled={!p.syncEnabled || anyBusy}
                        onClick={() => {
                          setFeedback(null);
                          setPending({ kind: "full", key: p.key });
                        }}
                      >
                        Toàn bộ
                      </Button>
                    </div>

                    {/* Mobile dropdown menu */}
                    <div className="sm:hidden">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 cursor-pointer p-0"
                            disabled={!p.syncEnabled || anyBusy}
                          >
                            <span className="sr-only">Thao tác cho {p.key}</span>
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="cursor-pointer gap-2"
                            onClick={() => {
                              setFeedback(null);
                              syncNow.mutate({ key: p.key });
                            }}
                          >
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                            Đồng bộ
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer gap-2"
                            onClick={() => {
                              setFeedback(null);
                              setPending({ kind: "full", key: p.key });
                            }}
                          >
                            <FolderSync className="h-4 w-4" aria-hidden="true" />
                            Đồng bộ toàn bộ
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <SyncSwitch
                      checked={p.syncEnabled}
                      disabled={anyBusy}
                      label={p.syncEnabled ? `Tắt đồng bộ ${p.key}` : `Bật đồng bộ ${p.key}`}
                      onChange={(next) => requestToggle(p.key, next)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </AsyncState>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        icon={pending?.kind === "full" ? RefreshCw : PauseCircle}
        tone={pending?.kind === "full" ? "default" : "destructive"}
        pending={toggleOne.isPending || toggleAll.isPending || syncNow.isPending}
        onConfirm={confirmPending}
        title={
          pending?.kind === "disable"
            ? `Tắt đồng bộ ${pending.key}?`
            : pending?.kind === "disable-all"
              ? `Tắt đồng bộ ${counts.enabled} dự án?`
              : pending?.kind === "full"
                ? `Đồng bộ toàn bộ ${pending.key}?`
                : ""
        }
        description={
          pending?.kind === "full"
            ? "Quét lại toàn bộ issue của dự án từ Jira, bỏ qua mốc đồng bộ gần nhất. Có thể mất vài phút với dự án lớn."
            : "Không ai đồng bộ được dự án này cho đến khi bật lại: kể cả lịch tự động, nút đồng bộ trên board và webhook Jira. Dữ liệu hiện có được giữ nguyên và hiển thị kèm cảnh báo. Lượt đồng bộ đang chạy (nếu có) sẽ chạy nốt."
        }
        confirmLabel={pending?.kind === "full" ? "Đồng bộ toàn bộ" : "Tắt đồng bộ"}
      />
    </div>
  );
}
