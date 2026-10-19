import { useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatJiraDuration, parseJiraDuration } from "@/lib/worklogs/schema";
import {
  ArrowRightLeft,
  CheckCheck,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  CircleX,
  Clock,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";
import { fieldRow } from "./bulk-preview-field-row";
import { type Preview, type PreviewBucket, type PreviewItem, SKIP_LABELS } from "./lib/bulk-types";
import { PREVIEW_PAGE_SIZE, warningVariant } from "./lib/bulk-utils";
import { BulkStepBadge } from "./bulk-step-badge";
import { getJiraIssueUrl } from "@/lib/jira/urls";

export function PreviewItemCard({ item, jiraBaseUrl }: { item: PreviewItem; jiraBaseUrl: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center gap-2">
        {jiraBaseUrl ? (
          <a
            href={getJiraIssueUrl(jiraBaseUrl, item.jiraKey) ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="group/link inline-flex items-center gap-1 font-mono text-xs font-semibold text-primary hover:underline"
            title={`Mở ${item.jiraKey} trên Jira`}
          >
            {item.jiraKey}
            <ExternalLink className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/link:opacity-100" aria-hidden />
          </a>
        ) : (
          <span className="font-mono text-xs font-semibold">{item.jiraKey}</span>
        )}
        {item.warning && (
          <Badge variant={warningVariant(item.warning)}>{item.warning.replace("_", " ")}</Badge>
        )}
        {item.skipReason && (
          <Badge variant="secondary">{SKIP_LABELS[item.skipReason] ?? item.skipReason.replace("_", " ")}</Badge>
        )}
        {item.targetField && (
          <Badge variant="outline" title={item.targetVersionId ? `${item.targetField.id}: ${item.targetVersionId}` : item.targetField.id}>
            {item.targetField.name}
          </Badge>
        )}
      </div>
      {item.skipReason ? (
        <p className="text-xs text-muted-foreground">
          Sẽ bỏ qua: {SKIP_LABELS[item.skipReason] ?? item.skipReason.replace("_", " ")}.
        </p>
      ) : (
        <div className="flex flex-col gap-1 border-t pt-2 mt-1">
          {fieldRow("Trạng thái", item.before, item.after, "status")}
          {fieldRow("Người phụ trách", item.before, item.after, "assignee")}
          {fieldRow("Độ ưu tiên", item.before, item.after, "priority")}
          {fieldRow("Type", item.before, item.after, "issueType")}
          {fieldRow("Story/Task Points", item.before, item.after, "points")}
          {fieldRow("Original Estimate", item.before, item.after, "estimateSeconds")}
          {fieldRow("Due date", item.before, item.after, "dueDate")}
          {fieldRow("Nhãn (Labels)", item.before, item.after, "labels")}
          {fieldRow("Fix Versions", item.before, item.after, "fixVersions")}
          {fieldRow("Epic / Task cha", item.before, item.after, "epic")}
          {fieldRow("Reporter", item.before, item.after, "reporter")}
          {fieldRow("Approver", item.before, item.after, "approver")}
          {fieldRow("Tester", item.before, item.after, "tester")}
          {Boolean(item.after.worklog) ? (
            <div className="flex items-center justify-between text-xs py-0.5 border-t mt-0.5">
              <span className="text-muted-foreground font-medium">Ghi Worklog:</span>
              <span className="font-semibold text-primary font-mono">
                +{String((item.after.worklog as { timeSpent?: string })?.timeSpent ?? "")}
                {(item.after.worklog as { comment?: string })?.comment
                  ? ` ("${(item.after.worklog as { comment?: string }).comment}")`
                  : ""}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PreviewItemList({
  items,
  jiraBaseUrl,
}: {
  items: PreviewItem[];
  jiraBaseUrl: string;
}) {
  const [limit, setLimit] = useState(PREVIEW_PAGE_SIZE);
  const displayed = items.slice(0, limit);
  const remaining = items.length - limit;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Không có task nào trong nhóm này"
        description="Chọn một thẻ tóm tắt khác để xem các task tương ứng."
        className="py-10"
      />
    );
  }

  return (
    <div className="space-y-2">
      {displayed.map((item) => (
        <PreviewItemCard key={item.jiraKey} item={item} jiraBaseUrl={jiraBaseUrl} />
      ))}
      {remaining > 0 && (
        <div className="pt-2 text-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLimit((prev) => prev + PREVIEW_PAGE_SIZE)}
            className="cursor-pointer"
          >
            Xem thêm (còn {remaining} task)
          </Button>
        </div>
      )}
    </div>
  );
}

/** Step 3: preview summary tabs, per-task diffs and the confirm/cancel actions. */
export function BulkPreviewCard({
  preview,
  previewOutdated,
  isLogWorkOp,
  isTransitionOp,
  worklogDuration,
  targetStatus,
  previewCounts,
  previewView,
  visiblePreviewItems,
  jiraBaseUrl,
  confirming,
  confirmLabel,
  onRefresh,
  onChangeView,
  onOpenConfirm,
  onCancel,
}: {
  preview: Preview;
  previewOutdated: boolean;
  isLogWorkOp: boolean;
  isTransitionOp: boolean;
  worklogDuration: string;
  targetStatus: string;
  previewCounts: Record<PreviewBucket, number>;
  previewView: PreviewBucket;
  visiblePreviewItems: PreviewItem[];
  jiraBaseUrl: string;
  confirming: boolean;
  confirmLabel: string;
  onRefresh: () => void;
  onChangeView: (bucket: PreviewBucket) => void;
  onOpenConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b p-4 sm:p-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <BulkStepBadge step={3} />
          Xem trước & Chạy
        </CardTitle>
        <CardDescription>
          {preview.actionable} trên tổng số {preview.total} task sẽ được thay đổi
          {preview.skipped > 0 ? `, ${preview.skipped} task bị bỏ qua` : ""}. Không có thay đổi nào được thực hiện cho đến khi bạn xác nhận.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
        {previewOutdated && (
          <FeedbackBanner
            tone="warning"
            action={<Button size="sm" variant="outline" onClick={onRefresh}>Làm mới xem trước</Button>}
          >
            Danh sách chọn hoặc thao tác đã thay đổi sau khi tạo bản xem trước này.
          </FeedbackBanner>
        )}

        {isLogWorkOp && (
          <div className="rounded-lg border border-primary/30 bg-primary-soft/40 p-4 text-xs text-foreground">
            <div className="font-semibold text-sm mb-1 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-primary" />
              Ghi nhận thời gian hàng loạt
            </div>
            <div>
              Mỗi task sẽ được cộng <strong>{worklogDuration}</strong>; tổng thời gian dự kiến ghi là{" "}
              <strong>
                {preview.actionable} × {worklogDuration} ={" "}
                {formatJiraDuration(preview.actionable * (parseJiraDuration(worklogDuration) ?? 0))}
              </strong>{" "}
              trên {preview.actionable} task.
            </div>
            <div className="mt-1 text-muted-foreground text-2xs">
              * Remaining Estimate của các task được giữ nguyên (adjustEstimate = leave).
            </div>
          </div>
        )}

        {isTransitionOp && (
          <div className="rounded-lg border border-primary/20 bg-primary-soft p-4 text-xs text-primary-soft-foreground">
            <div className="font-semibold text-sm mb-1 flex items-center gap-1.5 text-foreground">
              <ArrowRightLeft className="h-4 w-4 text-primary" />
              Chuyển trạng thái hàng loạt
            </div>
            <div className="text-foreground">
              Dự kiến chuyển trạng thái sang{" "}
              <Badge variant="outline" className="font-semibold mx-1">
                {targetStatus || (preview.items[0]?.after?.status as string) || ""}
              </Badge>{" "}
              cho {preview.actionable} task.
            </div>
            <div className="mt-1 text-muted-foreground text-2xs">
              * Hệ thống tự động kiểm tra luồng workflow trên Jira. Các task không có bước chuyển hợp lệ sẽ được xếp vào mục &quot;Bị chặn&quot; và bỏ qua an toàn.
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {([
            ["changes", "Sẽ thay đổi", previewCounts.changes, CheckCircle2, "text-success"],
            ["unchanged", "Không đổi", previewCounts.unchanged, CircleDashed, "text-muted-foreground"],
            ["warnings", "Cảnh báo", previewCounts.warnings, CircleAlert, "text-warning"],
            ["blocked", "Bị chặn", previewCounts.blocked, CircleX, "text-destructive"],
          ] as const).map(([bucket, label, count, Icon, color]) => (
            <button
              key={bucket}
              type="button"
              aria-pressed={previewView === bucket}
              onClick={() => onChangeView(bucket)}
              className={cn(
                "cursor-pointer rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                previewView === bucket && "border-primary bg-primary/5 shadow-sm"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground font-medium">{label}</span>
                {/* Dim only the decorative icon for empty buckets so text keeps ≥4.5:1 contrast. */}
                <Icon
                  className={cn("h-4 w-4", color, previewView !== bucket && count === 0 && "opacity-40")}
                  aria-hidden="true"
                />
              </span>
              <span
                className={cn(
                  "mt-1 block text-xl font-semibold",
                  previewView !== bucket && count === 0 && "text-muted-foreground"
                )}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        <div className="max-h-[420px] overflow-y-auto pr-1">
          <PreviewItemList
            key={previewView}
            items={visiblePreviewItems}
            jiraBaseUrl={jiraBaseUrl}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
          <Button
            onClick={onOpenConfirm}
            disabled={confirming || preview.actionable === 0 || previewOutdated}
          >
            {confirming ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4" aria-hidden="true" /> Hủy xem trước
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
