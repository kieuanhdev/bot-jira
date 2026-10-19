"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, CheckCircle2, Inbox, RefreshCw, Siren, Sparkles } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api-client";
import { meKeys, sentryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { compareTriage, triageIssue } from "@/lib/sentry/triage";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncState, ErrorState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton } from "@/components/shared/skeleton";
import { FeedbackBanner, type FeedbackTone } from "@/components/shared/feedback-banner";
import { PaginationFooter } from "@/components/shared/pagination-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SentryRow,
  type SentryRowItem,
  type SentryFilter,
  type RowState,
  FILTER_STATES,
  EMPTY,
  VALID_FILTERS,
} from "./sentry-row";
import { SentryFilterTabs } from "./sentry-filter-tabs";
import { SentryProjectTabs } from "./sentry-project-tabs";
import { SentryBulkBar } from "./sentry-bulk-bar";
import { SentryCreateDialog } from "./sentry-create-dialog";
import { SentryBulkCreateDialog } from "./sentry-bulk-create-dialog";

export type { SentryRowItem, SentryFilter, RowState };

type MappedSentryRow = SentryRowItem & { targetProject: string };

function hasTargetProject(row: SentryRowItem): row is MappedSentryRow {
  return Boolean(row.targetProject);
}

type TriageView = "actionable" | "noise" | "all";

export function SentryClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { data: meStatus } = useQuery({
    queryKey: meKeys.status,
    queryFn: () =>
      api<{ jiraName: string | null; role?: string; isAdmin?: boolean }>("/api/me/status"),
  });
  const isAdmin = Boolean(meStatus?.isAdmin || meStatus?.role === "admin");

  const rawFilter = searchParams.get("filter");
  const filter: SentryFilter =
    rawFilter && VALID_FILTERS.has(rawFilter)
      ? (!isAdmin && rawFilter === "ignored" ? "review" : (rawFilter as SentryFilter))
      : "review";

  const rawProject = searchParams.get("project")?.trim().toUpperCase() || "";
  const selectedProject = rawProject;

  const [page, setPage] = useState(1);
  const [view, setView] = useState<TriageView>("actionable");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Single issue create dialog
  const [formRow, setFormRow] = useState<MappedSentryRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Bulk create dialog (for multiple rows)
  const [bulkRows, setBulkRows] = useState<SentryRowItem[] | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: FeedbackTone; text: string } | null>(null);

  const queryUrl = `/api/sentry?state=${FILTER_STATES[filter]}${
    selectedProject ? `&project=${encodeURIComponent(selectedProject)}` : ""
  }`;

  const query = useQuery({
    queryKey: sentryKeys.list(filter, selectedProject || "all"),
    queryFn: () =>
      api<{ counts: Partial<Record<RowState, number>>; requireApproval: boolean; items: SentryRowItem[] }>(
        queryUrl
      ),
    refetchInterval: (q) => ((q.state.data?.counts.approved ?? 0) > 0 ? 5_000 : 30_000),
  });

  const counts = query.data?.counts ?? {};
  const allItems = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const triaged = filter === "review";
  const noiseItems = useMemo(() => allItems.filter((r) => triageIssue(r).tier === "noise"), [allItems]);
  const actionableCount = allItems.length - noiseItems.length;

  const items = useMemo(() => {
    if (!triaged) return allItems;
    const pool =
      view === "all"
        ? allItems
        : view === "noise"
          ? noiseItems
          : allItems.filter((r) => triageIssue(r).tier !== "noise");
    return [...pool].sort(compareTriage);
  }, [allItems, noiseItems, triaged, view]);

  const visibleSelected = useMemo(() => items.filter((r) => selected.has(r.id)), [items, selected]);
  const selectable = filter === "review" || filter === "rejected";

  const totalPages = Math.max(1, Math.ceil(items.length / 50));
  const paginatedItems = useMemo(() => items.slice((page - 1) * 50, page * 50), [items, page]);
  const allPageSelected = paginatedItems.length > 0 && paginatedItems.every((r) => selected.has(r.id));

  const updateUrl = (nextFilter: SentryFilter, nextProject: string) => {
    const params = new URLSearchParams();
    if (nextFilter !== "review") params.set("filter", nextFilter);
    if (nextProject) params.set("project", nextProject);
    const qs = params.toString();
    router.replace(qs ? `/sentry?${qs}` : "/sentry", { scroll: false });
  };

  const changeView = (next: TriageView) => {
    setPage(1);
    setSelected(new Set());
    setView(next);
  };

  // Selection is per page: a page holds at most 50 rows, the bulk-create limit.
  const changePage = (next: number) => {
    setPage(next);
    setSelected(new Set());
  };

  const changeFilter = (next: SentryFilter) => {
    setPage(1);
    setSelected(new Set());
    updateUrl(next, selectedProject);
  };

  const changeProject = (nextProject: string) => {
    setPage(1);
    setSelected(new Set());
    updateUrl(filter, nextProject);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: sentryKeys.all });
  };

  const decide = useMutation({
    mutationFn: (input: { ids: string[]; decision: "reject" | "reopen" }) =>
      api<{ updated: number }>("/api/sentry/review", { method: "POST", body: input }),
    onMutate: (input) => {
      setFeedback(null);
      if (input.ids.length === 1) setBusyId(input.ids[0]);
    },
    onSuccess: (data, input) => {
      const text =
        input.decision === "reject"
          ? `Đã bỏ qua ${data.updated} issue.`
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
    },
  });

  const retry = useMutation({
    mutationFn: (id: string) => api("/api/sentry/retry", { method: "POST", body: { id } }),
    onMutate: (id) => {
      setFeedback(null);
      setBusyId(id);
    },
    onSuccess: () => {
      setFeedback({ tone: "success", text: "Đã xếp hàng thử lại, task sẽ được tạo ở lượt chạy tới." });
      refresh();
    },
    onError: (err) => setFeedback({ tone: "destructive", text: getErrorMessage(err) }),
    onSettled: () => setBusyId(null),
  });

  const startCreate = (rows: SentryRowItem[]) => {
    if (rows.length === 1) {
      const only = rows[0];
      if (hasTargetProject(only)) {
        setFeedback(null);
        setFormRow(only);
        setFormOpen(true);
        return;
      }
    }
    // Multiple rows go through bulk create dialog
    setFeedback(null);
    setBulkRows(rows);
  };

  const handleFormCreated = (jiraKey: string) => {
    setFeedback({ tone: "success", text: `Đã tạo task ${jiraKey} từ lỗi Sentry.` });
    setSelected(new Set());
    refresh();
  };

  const handleBulkSuccess = ({ total }: { total: number }) => {
    setFeedback({
      tone: "success",
      text: `Đã gửi yêu cầu tạo ${total} task trên Jira. Task đang được xử lý trong nền.`,
    });
    setBulkRows(null);
    setSelected(new Set());
    refresh();
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const busy = decide.isPending || retry.isPending;
  const isJiraCredsError =
    feedback?.tone === "destructive" &&
    (feedback.text.toLowerCase().includes("settings") ||
      feedback.text.toLowerCase().includes("token jira"));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Bug}
        title="Lỗi Sentry"
        description="Theo dõi và chuyển lỗi từ Sentry thành task Jira theo từng dự án. Task được tạo bằng tài khoản cá nhân của bạn."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer gap-1.5"
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} aria-hidden="true" />
            Làm mới
          </Button>
        }
      />

      <SentryProjectTabs
        selectedProject={selectedProject}
        onSelectProject={changeProject}
        isAdmin={isAdmin}
      />

      <SentryFilterTabs
        filter={filter}
        onChange={changeFilter}
        counts={counts}
        isLoading={query.isLoading}
        isAdmin={isAdmin}
      />

      {feedback && (
        <FeedbackBanner tone={feedback.tone}>
          <div className="flex flex-col gap-1">
            <span>{feedback.text}</span>
            {isJiraCredsError && (
              <Link
                href="/settings"
                className="font-semibold underline underline-offset-2 hover:opacity-80"
              >
                Đến trang Cài đặt để cập nhật thông tin đăng nhập Jira →
              </Link>
            )}
          </div>
        </FeedbackBanner>
      )}

      {triaged && !query.isLoading && allItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Lọc theo mức độ cần xử lý" className="inline-flex gap-1 rounded-lg bg-muted p-1">
            {([
              { id: "actionable", label: "Cần xem xét", count: actionableCount, icon: Siren },
              { id: "noise", label: "Có thể là nhiễu", count: noiseItems.length, icon: Sparkles },
              { id: "all", label: "Tất cả", count: allItems.length, icon: Inbox },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={view === t.id}
                onClick={() => changeView(t.id)}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  view === t.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <t.icon className="h-4 w-4" aria-hidden="true" />
                {t.label}
                <span className="rounded-full bg-muted-foreground/15 px-1.5 text-xs tabular-nums">{t.count}</span>
              </button>
            ))}
          </div>
          {view === "noise" && noiseItems.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer gap-1.5"
              disabled={busy}
              onClick={() => decide.mutate({ ids: noiseItems.map((r) => r.id), decision: "reject" })}
            >
              Bỏ qua tất cả {noiseItems.length} issue nhiễu
            </Button>
          )}
        </div>
      )}

      {selectable && (
        <SentryBulkBar
          selectedCount={visibleSelected.length}
          showReject={filter === "review"}
          busy={busy}
          onCreate={() => startCreate(visibleSelected)}
          onReject={() => decide.mutate({ ids: visibleSelected.map((r) => r.id), decision: "reject" })}
        />
      )}

      <AsyncState
        loading={query.isLoading}
        error={query.error}
        empty={items.length === 0}
        loadingFallback={<ListSkeleton rows={5} />}
        errorFallback={
          <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} />
        }
        emptyFallback={
          <EmptyState
            icon={filter === "problem" ? CheckCircle2 : Inbox}
            {...(triaged && allItems.length > 0
              ? {
                  title: "Không có issue trong nhóm này",
                  hint: "Chuyển sang nhóm khác để xem các issue còn lại.",
                }
              : EMPTY[filter])}
          />
        }
      >
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-2 text-xs font-medium text-muted-foreground">
            <div className="flex items-center gap-3">
              {selectable && (
                <Checkbox
                  checked={allPageSelected ? true : visibleSelected.length > 0 ? "indeterminate" : false}
                  onCheckedChange={(checked) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      paginatedItems.forEach((r) => {
                        if (checked === true) next.add(r.id);
                        else next.delete(r.id);
                      });
                      return next;
                    })
                  }
                  aria-label="Chọn tất cả issue đang hiển thị trên trang này"
                />
              )}
              <span>Issue Sentry{triaged ? " · lỗi nghiêm trọng xếp trước" : ""}</span>
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
                isAdmin={isAdmin}
                onToggleSelect={(checked) => toggleSelectOne(row.id, checked)}
                onApprove={() => startCreate([row])}
                onReject={() => decide.mutate({ ids: [row.id], decision: "reject" })}
                onReopen={() => decide.mutate({ ids: [row.id], decision: "reopen" })}
                onRetry={() => retry.mutate(row.id)}
              />
            ))}
          </ul>

          <div className="border-t p-3">
            <PaginationFooter
              page={page}
              totalPages={totalPages}
              totalItems={items.length}
              itemLabel="issue"
              onPageChange={changePage}
            />
          </div>
        </Card>
      </AsyncState>

      {formRow && (
        <SentryCreateDialog
          key={formRow.id}
          row={formRow}
          open={formOpen}
          onOpenChange={setFormOpen}
          onCreated={handleFormCreated}
        />
      )}

      {bulkRows && (
        <SentryBulkCreateDialog
          rows={bulkRows}
          onCancel={() => setBulkRows(null)}
          onSuccess={handleBulkSuccess}
        />
      )}
    </div>
  );
}
