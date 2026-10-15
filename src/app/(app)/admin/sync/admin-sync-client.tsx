"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseZap, Loader2 } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api-client";
import { adminKeys, boardKeys } from "@/lib/query-keys";
import type { AdminProjectSyncRow, AdminSyncState } from "@/lib/admin/project-sync";
import { PRESET_LABELS, type SyncPreset } from "@/lib/jira/sync-features-shared";
import { SearchField } from "@/components/shared/search-field";
import { AsyncState, ErrorState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton } from "@/components/shared/skeleton";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { SyncSwitch } from "./sync-switch";
import { ProjectSyncRow, STATE_BADGE } from "./project-sync-row";
import { SyncBulkBar } from "./sync-bulk-bar";
import { SyncMetrics, type SyncFilterState } from "./sync-metrics";
import { SyncConfirmDialog, type PendingSyncAction } from "./sync-confirm-dialog";
import { SyncHeader } from "./sync-header";

export { SyncSwitch, STATE_BADGE };

const ProjectFeaturesSheet = dynamic(
  () => import("./project-features-sheet").then((m) => m.ProjectFeaturesSheet),
  { ssr: false }
);

type Feedback = { tone: "success" | "destructive" | "info"; text: string } | null;

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
  const [filterState, setFilterState] = useState<SyncFilterState>("all");
  const [pending, setPending] = useState<PendingSyncAction>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Bulk selection
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Sheet configuration state
  const [editingProject, setEditingProject] = useState<AdminProjectSyncRow | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: adminKeys.projects,
    queryFn: () =>
      api<{ items: AdminProjectSyncRow[]; generatedAt: string }>("/api/admin/projects"),
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
    } else if (filterState === "custom") {
      result = result.filter((p) => p.preset === "custom");
    }

    if (q) {
      result = result.filter(
        (p) => p.key.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
      );
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
      custom: items.filter((p) => p.preset === "custom").length,
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

  const bulkPreset = useMutation({
    mutationFn: ({
      keys,
      preset,
    }: {
      keys: string[];
      preset: Exclude<SyncPreset, "custom">;
    }) =>
      api<{ changed: string[]; backfillJobCount: number }>("/api/admin/projects", {
        method: "PATCH",
        body: { keys, preset },
      }),
    onSuccess: (res, vars) => {
      setFeedback({
        tone: "success",
        text: `Đã áp preset "${PRESET_LABELS[vars.preset]}" cho ${res.changed.length} dự án.${
          res.backfillJobCount > 0
            ? ` Đã xếp hàng ${res.backfillJobCount} lượt đồng bộ bù ngầm.`
            : ""
        }`,
      });
      setSelectedKeys(new Set());
      invalidate();
    },
    onError: (e) => setFeedback({ tone: "destructive", text: getErrorMessage(e) }),
  });

  const busyKey =
    (toggleOne.isPending && toggleOne.variables?.key) ||
    (syncNow.isPending && syncNow.variables?.key) ||
    null;
  const anyBusy =
    toggleOne.isPending ||
    toggleAll.isPending ||
    syncNow.isPending ||
    bulkPreset.isPending;

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

  // Bulk selection helpers
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selectedKeys.has(p.key));
  const someFilteredSelected =
    filtered.some((p) => selectedKeys.has(p.key)) && !allFilteredSelected;

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedKeys(new Set());
    } else {
      const next = new Set(selectedKeys);
      for (const p of filtered) next.add(p.key);
      setSelectedKeys(next);
    }
  }

  function toggleSelectRow(key: string, checked: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SyncHeader
        generatedAt={data?.generatedAt}
        disabledCount={counts.disabled}
        enabledCount={counts.enabled}
        anyBusy={anyBusy}
        onEnableAll={() => {
          setFeedback(null);
          toggleAll.mutate(true);
        }}
        onDisableAll={() => {
          setFeedback(null);
          setPending({ kind: "disable-all" });
        }}
        onSyncAll={() => {
          setFeedback(null);
          syncNow.mutate({});
        }}
      />

      <SyncMetrics
        counts={counts}
        isLoading={isLoading}
        filterState={filterState}
        onFilterChange={setFilterState}
      />

      {feedback && <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner>}

      <SyncBulkBar
        selectedCount={selectedKeys.size}
        onClearSelection={() => setSelectedKeys(new Set())}
        onApplyPreset={(preset) =>
          bulkPreset.mutate({
            keys: Array.from(selectedKeys),
            preset,
          })
        }
        disabled={anyBusy}
      />

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
            <Loader2
              className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
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
          <ErrorState
            title="Không thể tải danh sách dự án"
            message={getErrorMessage(error)}
            onRetry={() => refetch()}
          />
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
          {/* List header with bulk checkbox */}
          <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-2 text-xs font-medium text-muted-foreground">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                onCheckedChange={toggleSelectAll}
                aria-label="Chọn tất cả dự án đang hiển thị"
              />
              <span>Dự án</span>
            </div>
            <span>Thao tác đồng bộ</span>
          </div>

          <ul className="divide-y [content-visibility:auto]">
            {filtered.map((p) => (
              <ProjectSyncRow
                key={p.key}
                project={p}
                isSelected={selectedKeys.has(p.key)}
                onToggleSelect={(checked) => toggleSelectRow(p.key, checked)}
                isRowBusy={busyKey === p.key}
                isAnyBusy={anyBusy}
                isSyncingNow={syncNow.isPending}
                onSyncNow={() => {
                  setFeedback(null);
                  syncNow.mutate({ key: p.key });
                }}
                onRequestFullSync={() => {
                  setFeedback(null);
                  setPending({ kind: "full", key: p.key });
                }}
                onOpenConfig={() => setEditingProject(p)}
                onRequestToggleSync={(next) => requestToggle(p.key, next)}
              />
            ))}
          </ul>
        </Card>
      </AsyncState>

      {/* Sheet cấu hình đồng bộ dự án (lazy-loaded via next/dynamic) */}
      <ProjectFeaturesSheet
        project={editingProject}
        onClose={() => setEditingProject(null)}
        onSuccess={(text) => {
          setFeedback({ tone: "success", text });
          invalidate();
        }}
        onError={(text) => {
          setFeedback({ tone: "destructive", text });
        }}
      />

      {/* Master switch confirm dialog */}
      <SyncConfirmDialog
        pending={pending}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onConfirm={confirmPending}
        isPending={toggleOne.isPending || toggleAll.isPending || syncNow.isPending}
        enabledCount={counts.enabled}
      />
    </div>
  );
}
