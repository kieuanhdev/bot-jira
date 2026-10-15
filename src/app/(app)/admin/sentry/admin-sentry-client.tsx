"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock,
  ExternalLink,
  Inbox,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { api, getErrorMessage } from "@/lib/api-client";
import { adminKeys } from "@/lib/query-keys";
import { maskSecrets } from "@/lib/admin/mask-secrets";
import { cn, timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { MetricGrid } from "@/components/shared/metric-grid";
import { AsyncState, ErrorState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton } from "@/components/shared/skeleton";
import { FeedbackBanner, type FeedbackTone } from "@/components/shared/feedback-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

type RowState = "review" | "approved" | "created" | "rejected" | "failed" | "ignored";

type SentryRow = {
  id: string;
  sentryProject: string;
  sentryIssueId: string;
  shortId: string | null;
  title: string | null;
  level: string | null;
  permalinkUrl: string | null;
  eventCount: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  targetProject: string | null;
  jiraKey: string | null;
  jiraUrl: string | null;
  state: RowState;
  attemptCount: number;
  lastError: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type SentryQueueResponse = {
  counts: Partial<Record<RowState, number>>;
  requireApproval: boolean;
  items: SentryRow[];
};

type Filter = "review" | "approved" | "created" | "rejected" | "problem";

const FILTER_STATES: Record<Filter, string> = {
  review: "review",
  approved: "approved",
  created: "created",
  rejected: "rejected",
  problem: "failed,ignored",
};

const EMPTY: Record<Filter, { title: string; hint: string }> = {
  review: { title: "Không có issue chờ duyệt", hint: "Issue Sentry mới sẽ xuất hiện ở đây sau tối đa 5 phút." },
  approved: { title: "Không có task đang tạo", hint: "Issue đã duyệt sẽ được tạo trên Jira trong giây lát." },
  created: { title: "Chưa có task nào được tạo", hint: "Duyệt một issue trong tab Chờ duyệt để tạo task Jira." },
  rejected: { title: "Chưa bỏ qua issue nào", hint: "Issue bị bỏ qua sẽ không bao giờ được tạo task." },
  problem: { title: "Không có lỗi", hint: "Mọi issue đã duyệt đều được tạo task thành công." },
};

const STATE_BADGE: Record<RowState, { label: string; variant: "success" | "warning" | "danger" | "info" | "secondary" }> = {
  review: { label: "Chờ duyệt", variant: "warning" },
  approved: { label: "Đang tạo", variant: "info" },
  created: { label: "Đã tạo", variant: "success" },
  rejected: { label: "Đã bỏ qua", variant: "secondary" },
  failed: { label: "Lỗi", variant: "danger" },
  ignored: { label: "Chưa map dự án", variant: "danger" },
};

function levelVariant(level: string | null): "danger" | "warning" | "info" | "secondary" {
  if (level === "fatal") return "danger";
  if (level === "error") return "warning";
  if (level === "warning") return "info";
  return "secondary";
}

export function AdminSentryClient() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("review");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: FeedbackTone; text: string } | null>(null);

  const queryKey = [...adminKeys.sentry, filter] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => api<SentryQueueResponse>(`/api/admin/sentry-import?state=${FILTER_STATES[filter]}`),
    // Approved rows turn into Jira tasks within seconds; poll while any are in flight.
    refetchInterval: (q) => ((q.state.data?.counts.approved ?? 0) > 0 ? 5_000 : 30_000),
  });

  const counts = query.data?.counts ?? {};
  const items = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const selectable = filter === "review" || filter === "rejected";
  const visibleSelected = items.filter((r) => selected.has(r.id));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.sentry });
    queryClient.invalidateQueries({ queryKey: adminKeys.overview });
  };

  const decide = useMutation({
    mutationFn: (input: { ids: string[]; decision: "approve" | "reject" | "reopen" }) =>
      api<{ updated: number; queued: boolean }>("/api/admin/sentry-import/review", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onMutate: (input) => {
      setFeedback(null);
      if (input.ids.length === 1) setBusyId(input.ids[0]);
    },
    onSuccess: (data, input) => {
      const text =
        input.decision === "approve"
          ? `Đã duyệt ${data.updated} issue, task Jira đang được tạo.`
          : input.decision === "reject"
            ? `Đã bỏ qua ${data.updated} issue.`
            : `Đã đưa ${data.updated} issue về danh sách chờ duyệt.`;
      setFeedback({ tone: "success", text });
      setSelected(new Set());
      refresh();
    },
    onError: (error) => {
      setFeedback({ tone: "destructive", text: getErrorMessage(error) });
      refresh();
    },
    onSettled: () => setBusyId(null),
  });

  const retry = useMutation({
    mutationFn: (id: string) =>
      api("/api/admin/sentry-import", { method: "POST", body: JSON.stringify({ id }) }),
    onMutate: (id) => {
      setFeedback(null);
      setBusyId(id);
    },
    onSuccess: () => {
      setFeedback({ tone: "success", text: "Đã xếp hàng thử lại, task sẽ được tạo ở lượt chạy tới." });
      refresh();
    },
    onError: (error) => setFeedback({ tone: "destructive", text: getErrorMessage(error) }),
    onSettled: () => setBusyId(null),
  });

  const busy = decide.isPending || retry.isPending;

  const changeFilter = (next: Filter) => {
    setFilter(next);
    setSelected(new Set());
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const allSelected = items.length > 0 && visibleSelected.length === items.length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Bug}
        title="Duyệt lỗi Sentry"
        description="Issue mới từ Sentry chờ ở đây. Chọn issue thật sự là lỗi để tạo task Bug trên Jira, bỏ qua các issue nhiễu."
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

      {query.data && !query.data.requireApproval && (
        <FeedbackBanner tone="warning">
          Đang ở chế độ tự động: mọi issue Sentry mới đều được tạo task mà không cần duyệt
          (SENTRY_IMPORT_REQUIRE_APPROVAL=false).
        </FeedbackBanner>
      )}

      <MetricGrid columns={5}>
        <MetricCard
          label="Chờ duyệt"
          value={counts.review ?? 0}
          icon={Inbox}
          tone="warning"
          loading={query.isLoading}
          onClick={() => changeFilter("review")}
          selected={filter === "review"}
        />
        <MetricCard
          label="Đang tạo"
          value={counts.approved ?? 0}
          icon={Clock}
          tone="info"
          loading={query.isLoading}
          onClick={() => changeFilter("approved")}
          selected={filter === "approved"}
        />
        <MetricCard
          label="Đã tạo task"
          value={counts.created ?? 0}
          icon={CheckCircle2}
          tone="success"
          loading={query.isLoading}
          onClick={() => changeFilter("created")}
          selected={filter === "created"}
        />
        <MetricCard
          label="Đã bỏ qua"
          value={counts.rejected ?? 0}
          icon={XCircle}
          loading={query.isLoading}
          onClick={() => changeFilter("rejected")}
          selected={filter === "rejected"}
        />
        <MetricCard
          label="Lỗi"
          value={(counts.failed ?? 0) + (counts.ignored ?? 0)}
          icon={AlertTriangle}
          tone="danger"
          loading={query.isLoading}
          onClick={() => changeFilter("problem")}
          selected={filter === "problem"}
        />
      </MetricGrid>

      {feedback && <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner>}

      {selectable && visibleSelected.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3 shadow-sm">
          <span className="text-sm font-semibold text-foreground">
            Đã chọn {visibleSelected.length} issue
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="cursor-pointer gap-1.5"
              disabled={busy}
              onClick={() => decide.mutate({ ids: visibleSelected.map((r) => r.id), decision: "approve" })}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Tạo task cho {visibleSelected.length} issue
            </Button>
            {filter === "review" && (
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer gap-1.5"
                disabled={busy}
                onClick={() => decide.mutate({ ids: visibleSelected.map((r) => r.id), decision: "reject" })}
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Bỏ qua
              </Button>
            )}
          </div>
        </div>
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
                  checked={allSelected ? true : visibleSelected.length > 0 ? "indeterminate" : false}
                  onCheckedChange={(checked) =>
                    setSelected(checked === true ? new Set(items.map((r) => r.id)) : new Set())
                  }
                  aria-label="Chọn tất cả issue đang hiển thị"
                />
              )}
              <span>Issue Sentry</span>
            </div>
            <span>Thao tác</span>
          </div>

          <ul className="divide-y">
            {items.map((row) => {
              const rowBusy = busyId === row.id;
              const badge = STATE_BADGE[row.state] ?? STATE_BADGE.review;
              const error = maskSecrets(row.lastError);
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 p-4 transition-colors duration-150 sm:flex-row sm:items-start"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {selectable && (
                      <div className="pt-0.5">
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={(checked) => toggleRow(row.id, checked === true)}
                          aria-label={`Chọn issue ${row.shortId ?? row.sentryIssueId}`}
                        />
                      </div>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={levelVariant(row.level)} className="uppercase">
                          {row.level ?? "?"}
                        </Badge>
                        <span className="line-clamp-2 text-sm font-medium text-foreground">
                          {row.title ?? `Sentry issue #${row.sentryIssueId}`}
                        </span>
                        {filter !== "review" && <Badge variant={badge.variant}>{badge.label}</Badge>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {row.permalinkUrl ? (
                          <a
                            href={row.permalinkUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex cursor-pointer items-center gap-1 font-mono text-primary hover:underline"
                          >
                            {row.shortId ?? row.sentryIssueId}
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="font-mono">{row.shortId ?? row.sentryIssueId}</span>
                        )}
                        <span>
                          {row.sentryProject} → {row.targetProject ?? "chưa map"}
                        </span>
                        {row.eventCount !== null && (
                          <span>{row.eventCount.toLocaleString("vi-VN")} lần xảy ra</span>
                        )}
                        <span>
                          lần cuối {timeAgo(row.lastSeen ?? row.createdAt)}
                        </span>
                        {row.reviewedBy && row.reviewedAt && (
                          <span>
                            · {row.reviewedBy} quyết định {timeAgo(row.reviewedAt)}
                          </span>
                        )}
                      </div>
                      {error && (row.state === "failed" || row.state === "ignored" || row.state === "approved") && (
                        <pre className="mt-1 max-h-24 overflow-x-auto whitespace-pre-wrap rounded bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
                          {error}
                        </pre>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    {row.state === "review" && (
                      <>
                        <Button
                          size="sm"
                          className="cursor-pointer gap-1.5"
                          disabled={busy}
                          onClick={() => decide.mutate({ ids: [row.id], decision: "approve" })}
                        >
                          {rowBusy && decide.variables?.decision === "approve" ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          )}
                          Tạo task
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="cursor-pointer gap-1.5"
                          disabled={busy}
                          onClick={() => decide.mutate({ ids: [row.id], decision: "reject" })}
                        >
                          <XCircle className="h-4 w-4" aria-hidden="true" />
                          Bỏ qua
                        </Button>
                      </>
                    )}
                    {row.state === "rejected" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer gap-1.5"
                        disabled={busy}
                        onClick={() => decide.mutate({ ids: [row.id], decision: "reopen" })}
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Đưa về chờ duyệt
                      </Button>
                    )}
                    {row.state === "approved" && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        Đang tạo task…
                      </span>
                    )}
                    {row.state === "created" && row.jiraKey && (
                      row.jiraUrl ? (
                        <a
                          href={row.jiraUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex cursor-pointer items-center gap-1 font-mono text-sm font-semibold text-primary hover:underline"
                        >
                          {row.jiraKey}
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="font-mono text-sm font-semibold">{row.jiraKey}</span>
                      )
                    )}
                    {(row.state === "failed" || row.state === "ignored") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer gap-1.5"
                        disabled={busy}
                        onClick={() => retry.mutate(row.id)}
                      >
                        <RefreshCw className={cn("h-4 w-4", rowBusy && "animate-spin")} aria-hidden="true" />
                        Thử lại
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </AsyncState>
    </div>
  );
}
