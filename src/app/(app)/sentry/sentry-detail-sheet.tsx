"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, KeyRound, Users } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api-client";
import { sentryKeys } from "@/lib/query-keys";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/utils";
import type { SentryDetailResponse } from "@/app/api/sentry/[id]/detail/route";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { levelVariant, type SentryRowItem } from "./sentry-row";

const TAG_LABELS: Record<string, string> = {
  release: "Phiên bản",
  environment: "Môi trường",
  os: "Hệ điều hành",
  browser: "Trình duyệt",
  transaction: "Transaction",
  url: "URL",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-2xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export interface SentryDetailSheetProps {
  row: SentryRowItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isBusy?: boolean;
  onApprove: (row: SentryRowItem) => void;
  onReject: (row: SentryRowItem) => void;
}

export function SentryDetailSheet({ row, open, onOpenChange, isBusy = false, onApprove, onReject }: SentryDetailSheetProps) {
  const detail = useQuery({
    queryKey: sentryKeys.detail(row?.id ?? ""),
    queryFn: () => api<SentryDetailResponse>(`/api/sentry/${encodeURIComponent(row!.id)}/detail`),
    enabled: open && Boolean(row),
    staleTime: 60_000,
    retry: false,
  });

  const digest = detail.data?.digest ?? null;
  const tags = Object.entries(digest?.tags ?? {});
  const isReview = row?.state === "review";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={row?.shortId ?? "Chi tiết issue"}
      description={row?.sentryProject ? `${row.sentryProject} → ${row.targetProject ?? "chưa map"}` : undefined}
      className="sm:max-w-xl"
      footer={
        row && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {row.permalinkUrl ? (
              <a
                href={row.permalinkUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Mở trên Sentry
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : (
              <span />
            )}
            {isReview && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="cursor-pointer" disabled={isBusy} onClick={() => onReject(row)}>
                  Bỏ qua
                </Button>
                <Button size="sm" className="cursor-pointer" disabled={isBusy} onClick={() => onApprove(row)}>
                  Tạo task
                </Button>
              </div>
            )}
          </div>
        )
      }
    >
      {row && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={levelVariant(row.level)} className="uppercase">
                {row.level ?? "?"}
              </Badge>
              {row.release && <Badge variant="secondary">{row.release}</Badge>}
              {row.environment && <Badge variant="secondary">{row.environment}</Badge>}
            </div>
            <p className="text-sm font-medium text-foreground">{row.title ?? `Sentry issue #${row.sentryIssueId}`}</p>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <Fact label="Số lần xảy ra" value={row.eventCount !== null ? formatNumber(row.eventCount) : "—"} />
            <Fact
              label="Người dùng bị ảnh hưởng"
              value={
                row.userCount != null ? (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatNumber(row.userCount)}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <Fact label="Xuất hiện lần đầu" value={row.firstSeen ? formatDateTime(row.firstSeen) : "—"} />
            <Fact
              label="Lần cuối"
              value={row.lastSeen ? `${formatDateTime(row.lastSeen)} (${formatRelative(row.lastSeen, { locale: "vi" })})` : "—"}
            />
          </dl>

          {detail.isLoading ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-5 w-1/4" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : detail.isError ? (
            <p role="alert" className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {getErrorMessage(detail.error)}
            </p>
          ) : detail.data?.reason === "no_token" ? (
            <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Chưa có token Sentry nào đọc được dự án này nên không lấy được stack trace. Thêm token trong Cài đặt.
            </p>
          ) : detail.data?.reason === "error" || !digest ? (
            <div className="flex items-center justify-between gap-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <span>Không lấy được event mới nhất từ Sentry.</span>
              <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => detail.refetch()}>
                Thử lại
              </Button>
            </div>
          ) : (
            <>
              {(digest.exceptionType || digest.exceptionValue) && (
                <Section title="Exception">
                  <p className="break-words text-sm text-foreground">
                    {digest.exceptionType && <span className="font-semibold">{digest.exceptionType}</span>}
                    {digest.exceptionType && digest.exceptionValue ? ": " : ""}
                    {digest.exceptionValue}
                  </p>
                </Section>
              )}

              {(digest.culprit || row.culprit) && (
                <Section title="Vị trí gây lỗi">
                  <p className="break-all font-mono text-xs text-foreground">{digest.culprit ?? row.culprit}</p>
                </Section>
              )}

              {digest.frames.length > 0 && (
                <Section title={`Stack trace (${digest.frames.length} frame trong app)`}>
                  <ol className="flex flex-col divide-y divide-border rounded-md border border-border bg-muted/20 font-mono text-xs">
                    {digest.frames.map((f, i) => (
                      <li key={`${f.file}:${f.line ?? ""}:${i}`} className="flex flex-col gap-0.5 px-3 py-2">
                        <span className="break-all font-semibold text-foreground">{f.fn}</span>
                        <span className="break-all text-muted-foreground">
                          {f.file}
                          {f.line !== undefined ? `:${f.line}` : ""}
                        </span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {tags.length > 0 && (
                <Section title="Thẻ">
                  <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {tags.map(([key, value]) => (
                      <Fact key={key} label={TAG_LABELS[key] ?? key} value={<span title={value}>{value}</span>} />
                    ))}
                  </dl>
                </Section>
              )}

              {digest.requestUrl && (
                <Section title="Request URL">
                  <p className="break-all font-mono text-xs text-foreground">{digest.requestUrl}</p>
                </Section>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
