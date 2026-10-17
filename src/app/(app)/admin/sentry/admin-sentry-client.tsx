"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, CheckCircle2, Inbox, RefreshCw } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api-client";
import { adminKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncState, ErrorState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton } from "@/components/shared/skeleton";
import { FeedbackBanner, type FeedbackTone } from "@/components/shared/feedback-banner";
import { PaginationFooter } from "@/components/shared/pagination-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { SentryRow, type SentryRowItem, type SentryFilter, type RowState, FILTER_STATES, EMPTY, VALID_FILTERS } from "./sentry-row";
import { SentryBulkBar } from "./sentry-bulk-bar";
import { SentryApproveDialog } from "./sentry-approve-dialog";
import { SentryFilterTabs } from "./sentry-filter-tabs";

export type { SentryRowItem, SentryFilter, RowState };

export function AdminSentryClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const rawFilter = searchParams.get("filter");
  const filter: SentryFilter = rawFilter && VALID_FILTERS.has(rawFilter) ? (rawFilter as SentryFilter) : "review";

  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Rows awaiting the admin's confirmation in the preview dialog.
  const [confirmRows, setConfirmRows] = useState<SentryRowItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: FeedbackTone; text: string } | null>(null);

  const query = useQuery({
    queryKey: adminKeys.sentryList(filter),
    queryFn: () => api<{ counts: Partial<Record<RowState, number>>; requireApproval: boolean; items: SentryRowItem[] }>(
      `/api/admin/sentry-import?state=${FILTER_STATES[filter]}`
    ),
    refetchInterval: (q) => ((q.state.data?.counts.approved ?? 0) > 0 ? 5_000 : 30_000),
  });

  const counts = query.data?.counts ?? {};
  const items = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const visibleSelected = useMemo(() => items.filter((r) => selected.has(r.id)), [items, selected]);
  const selectable = filter === "review" || filter === "rejected";

  const totalPages = Math.max(1, Math.ceil(items.length / 50));
  const paginatedItems = useMemo(() => items.slice((page - 1) * 50, page * 50), [items, page]);
  const allPageSelected = paginatedItems.length > 0 && paginatedItems.every((r) => selected.has(r.id));

  const changeFilter = (next: SentryFilter) => {
    setPage(1);
    setSelected(new Set());
    router.replace(next === "review" ? "/admin/sentry" : `/admin/sentry?filter=${next}`, { scroll: false });
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.sentry });
    queryClient.invalidateQueries({ queryKey: adminKeys.overview });
  };

  const decide = useMutation({
    mutationFn: (input: { ids: string[]; decision: "approve" | "reject" | "reopen"; summary?: string; description?: string }) =>
      api<{ updated: number; queued: boolean }>("/api/admin/sentry-import/review", { method: "POST", body: input }),
    onMutate: (input) => {
      setFeedback(null);
      if (input.ids.length === 1) setBusyId(input.ids[0]);
    },
    onSuccess: (data, input) => {
      const text = input.decision === "approve" ? `Đã duyệt ${data.updated} issue, task Jira đang được tạo.`
        : input.decision === "reject" ? `Đã bỏ qua ${data.updated} issue.`
        : `Đã đưa ${data.updated} issue về danh sách chờ duyệt.`;
      setFeedback({ tone: "success", text });
      setSelected(new Set());
      refresh();
    },
    onError: (err) => {
      setFeedback({ tone: "destructive", text: getErrorMessage(err) });
      refresh();
    },
    onSettled: () => {
      setBusyId(null);
      setConfirmRows(null);
    },
  });

  const retry = useMutation({
    mutationFn: (id: string) => api("/api/admin/sentry-import", { method: "POST", body: { id } }),
    onMutate: (id) => { setFeedback(null); setBusyId(id); },
    onSuccess: () => { setFeedback({ tone: "success", text: "Đã xếp hàng thử lại, task sẽ được tạo ở lượt chạy tới." }); refresh(); },
    onError: (err) => setFeedback({ tone: "destructive", text: getErrorMessage(err) }),
    onSettled: () => setBusyId(null),
  });

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const busy = decide.isPending || retry.isPending;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Bug}
        title="Duyệt lỗi Sentry"
        description="Issue mới từ Sentry chờ ở đây. Chọn issue thật sự là lỗi để tạo task Bug trên Jira, bỏ qua các issue nhiễu."
        actions={
          <Button variant="outline" size="sm" className="cursor-pointer gap-1.5" disabled={query.isFetching} onClick={() => query.refetch()}>
            <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} aria-hidden="true" />
            Làm mới
          </Button>
        }
      />

      {query.data && !query.data.requireApproval && (
        <FeedbackBanner tone="warning">
          Đang ở chế độ tự động: mọi issue Sentry mới đều được tạo task mà không cần duyệt (SENTRY_IMPORT_REQUIRE_APPROVAL=false).
        </FeedbackBanner>
      )}

      <SentryFilterTabs filter={filter} onChange={changeFilter} counts={counts} isLoading={query.isLoading} />
      {feedback && <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner>}

      {selectable && (
        <SentryBulkBar
          selectedCount={visibleSelected.length}
          showReject={filter === "review"}
          busy={busy}
          onApprove={() => setConfirmRows(visibleSelected)}
          onReject={() => decide.mutate({ ids: visibleSelected.map((r) => r.id), decision: "reject" })}
        />
      )}

      <AsyncState
        loading={query.isLoading}
        error={query.error}
        empty={items.length === 0}
        loadingFallback={<ListSkeleton rows={5} />}
        errorFallback={<ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} />}
        emptyFallback={<EmptyState icon={filter === "problem" ? CheckCircle2 : Inbox} {...EMPTY[filter]} />}
      >
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-2 text-xs font-medium text-muted-foreground">
            <div className="flex items-center gap-3">
              {selectable && (
                <Checkbox
                  checked={allPageSelected ? true : visibleSelected.length > 0 ? "indeterminate" : false}
                  onCheckedChange={(checked) => setSelected((prev) => {
                    const next = new Set(prev);
                    paginatedItems.forEach((r) => { if (checked === true) next.add(r.id); else next.delete(r.id); });
                    return next;
                  })}
                  aria-label="Chọn tất cả issue đang hiển thị trên trang này"
                />
              )}
              <span>Issue Sentry</span>
            </div>
            <span>Thao tác</span>
          </div>

          <ul className="divide-y">
            {paginatedItems.map((row) => (
              <SentryRow
                key={row.id}
                row={row}
                isSelected={selected.has(row.id)}
                selectable={selectable}
                filter={filter}
                isBusy={busyId === row.id}
                isDecidingApprove={decide.variables?.decision === "approve"}
                onToggleSelect={(checked) => toggleSelectOne(row.id, checked)}
                onApprove={() => setConfirmRows([row])}
                onReject={() => decide.mutate({ ids: [row.id], decision: "reject" })}
                onReopen={() => decide.mutate({ ids: [row.id], decision: "reopen" })}
                onRetry={() => retry.mutate(row.id)}
              />
            ))}
          </ul>

          <div className="border-t p-3">
            <PaginationFooter page={page} totalPages={totalPages} totalItems={items.length} itemLabel="issue" onPageChange={setPage} />
          </div>
        </Card>
      </AsyncState>

      <SentryApproveDialog
        rows={confirmRows}
        pending={decide.isPending}
        onCancel={() => setConfirmRows(null)}
        onConfirm={(edits) => confirmRows && decide.mutate({ ids: confirmRows.map((r) => r.id), decision: "approve", ...edits })}
      />
    </div>
  );
}
