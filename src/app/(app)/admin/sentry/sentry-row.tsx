"use client";

import { CheckCircle2, ExternalLink, Lightbulb, Loader2, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { maskSecrets } from "@/lib/admin/mask-secrets";
import { cn, timeAgo, formatNumber } from "@/lib/utils";
import { triageIssue, type TriageTier } from "@/lib/sentry/triage";

export type RowState = "review" | "approved" | "created" | "rejected" | "failed" | "ignored";

export type SentryRowItem = {
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
  draftSummary?: string | null;
  draftDescription?: string | null;
  jiraKey: string | null;
  jiraUrl: string | null;
  state: RowState;
  attemptCount: number;
  lastError: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type SentryFilter = "review" | "approved" | "created" | "rejected" | "problem";

export const STATE_BADGE: Record<
  RowState,
  { label: string; variant: "success" | "warning" | "danger" | "info" | "secondary" }
> = {
  review: { label: "Chờ duyệt", variant: "warning" },
  approved: { label: "Đang tạo", variant: "info" },
  created: { label: "Đã tạo", variant: "success" },
  rejected: { label: "Đã bỏ qua", variant: "secondary" },
  failed: { label: "Lỗi", variant: "danger" },
  ignored: { label: "Chưa map dự án", variant: "danger" },
};

export const FILTER_STATES: Record<SentryFilter, string> = {
  review: "review",
  approved: "approved",
  created: "created",
  rejected: "rejected",
  problem: "failed,ignored",
};

export const EMPTY: Record<SentryFilter, { title: string; hint: string }> = {
  review: { title: "Không có issue chờ duyệt", hint: "Issue Sentry mới sẽ xuất hiện ở đây sau tối đa 5 phút." },
  approved: { title: "Không có task đang tạo", hint: "Issue đã duyệt sẽ được tạo trên Jira trong giây lát." },
  created: { title: "Chưa có task nào được tạo", hint: "Duyệt một issue trong tab Chờ duyệt để tạo task Jira." },
  rejected: { title: "Chưa bỏ qua issue nào", hint: "Issue bị bỏ qua sẽ không bao giờ được tạo task." },
  problem: { title: "Không có lỗi", hint: "Mọi issue đã duyệt đều được tạo task thành công." },
};

export const VALID_FILTERS: Set<string> = new Set(["review", "approved", "created", "rejected", "problem"]);

export function levelVariant(level: string | null): "danger" | "warning" | "info" | "secondary" {
  if (level === "fatal") return "danger";
  if (level === "error") return "warning";
  if (level === "warning") return "info";
  return "secondary";
}

const TIER_STRIPE: Record<TriageTier, string> = {
  critical: "border-l-destructive",
  normal: "border-l-warning",
  noise: "border-l-border",
};

export interface SentryRowProps {
  row: SentryRowItem;
  isSelected: boolean;
  selectable: boolean;
  filter: SentryFilter;
  isBusy: boolean;
  isDecidingApprove: boolean;
  onToggleSelect: (checked: boolean) => void;
  onApprove: () => void;
  onReject: () => void;
  onReopen: () => void;
  onRetry: () => void;
}

export function SentryRow({
  row,
  isSelected,
  selectable,
  filter,
  isBusy,
  isDecidingApprove,
  onToggleSelect,
  onApprove,
  onReject,
  onReopen,
  onRetry,
}: SentryRowProps) {
  const badge = STATE_BADGE[row.state] ?? STATE_BADGE.review;
  const error = maskSecrets(row.lastError);
  const triage = triageIssue(row);
  const isReview = row.state === "review";

  return (
    <li
      className={cn(
        "flex flex-col gap-3 border-l-4 p-4 transition-colors duration-150 hover:bg-muted/30 sm:flex-row sm:items-start",
        isReview ? TIER_STRIPE[triage.tier] : "border-l-transparent",
        isReview && triage.tier === "noise" && "bg-muted/10"
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {selectable && (
          <div className="pt-0.5">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onToggleSelect(checked === true)}
              aria-label={`Chọn issue ${row.shortId ?? row.sentryIssueId}`}
            />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={levelVariant(row.level)} className="uppercase">
              {row.level ?? "?"}
            </Badge>
            <span className={cn("line-clamp-2 text-sm font-medium", isReview && triage.tier === "noise" ? "text-muted-foreground" : "text-foreground")}>
              {row.title ?? `Sentry issue #${row.sentryIssueId}`}
            </span>
            {filter !== "review" && <Badge variant={badge.variant}>{badge.label}</Badge>}
          </div>

          {isReview && triage.reason && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Có thể không phải lỗi: {triage.reason}
            </p>
          )}

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
            {row.eventCount !== null && <span className="font-semibold text-foreground">{formatNumber(row.eventCount)} lần xảy ra</span>}
            <span>lần cuối {timeAgo(row.lastSeen ?? row.createdAt)}</span>
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
              disabled={isBusy}
              onClick={onApprove}
            >
              {isBusy && isDecidingApprove ? (
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
              disabled={isBusy}
              onClick={onReject}
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
            disabled={isBusy}
            onClick={onReopen}
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
            disabled={isBusy}
            onClick={onRetry}
          >
            <RefreshCw className={cn("h-4 w-4", isBusy && "animate-spin")} aria-hidden="true" />
            Thử lại
          </Button>
        )}
      </div>
    </li>
  );
}
