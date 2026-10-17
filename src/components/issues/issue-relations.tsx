"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, GitFork, Layers3, Link2, Network, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { CreateChildDialog, type CreatedChild } from "@/components/issues/create-child-dialog";
import { cn } from "@/lib/utils";
import type { IssueRelationships, LinkedIssue, RelatedIssue } from "@/lib/issues/relationships";

function RelationRow({ issue, label }: { issue: RelatedIssue; label?: string }) {
  return (
    <Link
      href={`/issue/${encodeURIComponent(issue.jiraKey)}`}
      className="group flex cursor-pointer items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-2 transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {label && <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>}
          <span className="shrink-0 font-mono text-xs font-semibold text-primary">{issue.jiraKey}</span>
          {issue.status && (
            <Badge variant="outline" className="h-5 min-w-0 max-w-28 truncate px-1.5 text-[10px] font-medium">
              {issue.status}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-foreground">
          {issue.summary || issue.type || "Mở task để xem chi tiết"}
        </p>
      </div>
      <ArrowUpRight
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-primary"
        aria-hidden="true"
      />
    </Link>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1 text-[11px] font-medium normal-case tracking-normal text-primary transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Plus className="h-3 w-3" aria-hidden="true" /> {label}
    </button>
  );
}

function RelationGroup({
  icon,
  title,
  issues,
  action,
  emptyHint,
}: {
  icon: ReactNode;
  title: string;
  issues: Array<RelatedIssue | LinkedIssue>;
  /** Jira-style "+" control; keeps the group visible while it is empty. */
  action?: ReactNode;
  emptyHint?: string;
}) {
  if (issues.length === 0 && !action) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{title}</span>
        {issues.length > 0 && <span className="tabular-nums">({issues.length})</span>}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {issues.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
          {emptyHint}
        </p>
      ) : (
        <div className="space-y-1.5">
          {issues.map((issue) => (
            <RelationRow
              key={`${"relation" in issue ? issue.relation : title}-${issue.jiraKey}`}
              issue={issue}
              label={"relation" in issue ? issue.relation : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function IssueRelations({
  relationships,
  loading,
  className,
  issueKey,
  issueType,
  onLinkIssue,
  onChanged,
}: {
  relationships?: IssueRelationships;
  loading: boolean;
  className?: string;
  /** Enables the "+" controls; without it the list is read-only. */
  issueKey?: string;
  /** Issue type name: an Epic gets "task in Epic", anything else gets a sub-task. */
  issueType?: string;
  /** Opens the view's link dialog. Omit to hide "+ Liên kết". */
  onLinkIssue?: () => void;
  /** Called after a child was created, so the view can reload. */
  onChanged?: () => void | Promise<void>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedChild | null>(null);

  if (loading) {
    return (
      <section className={cn(className)} aria-label="Đang tải liên kết công việc">
        <Skeleton className="h-4 w-36" />
        <div className="mt-2 space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </section>
    );
  }

  const relationCount =
    (relationships?.epic ? 1 : 0) +
    (relationships?.parent ? 1 : 0) +
    (relationships?.children.length ?? 0) +
    (relationships?.links.length ?? 0);

  const isEpic = issueType?.trim().toLowerCase() === "epic";
  // `parent` is only set for a non-epic parent, i.e. this issue is a sub-task, and
  // Jira cannot nest those further.
  const canCreateChild = Boolean(issueKey) && !relationships?.parent;
  const canAct = Boolean(issueKey);
  const childAction = canCreateChild ? (
    <AddButton
      label={isEpic ? "Tạo task trong Epic" : "Tạo sub-task"}
      onClick={() => {
        setCreated(null);
        setCreateOpen(true);
      }}
    />
  ) : undefined;
  const linkAction = onLinkIssue ? <AddButton label="Liên kết task" onClick={onLinkIssue} /> : undefined;

  return (
    <section className={cn(className)} aria-labelledby="work-relations-title">
      <div className="mb-3 flex items-center gap-2">
        <Network className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 id="work-relations-title" className="text-sm font-semibold">Liên kết công việc</h3>
        {relationCount > 0 && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">
            {relationCount}
          </Badge>
        )}
      </div>

      {created && (
        <FeedbackBanner
          tone={created.linkError ? "warning" : "success"}
          className="mb-3 text-xs"
          action={
            <Link href={`/issue/${encodeURIComponent(created.key)}`} className="cursor-pointer underline underline-offset-2">
              Mở {created.key}
            </Link>
          }
        >
          <span className="min-w-0 break-words">
            Đã tạo {created.key}.
            {created.linkError ? ` Chưa gắn được vào Epic: ${created.linkError}` : ""}
          </span>
        </FeedbackBanner>
      )}

      {relationCount === 0 && !childAction && !linkAction ? (
        <div className="flex items-center gap-3 rounded-md border border-dashed bg-muted/20 p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium">Chưa có task liên quan</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Epic, task con và issue links từ Jira sẽ hiện ở đây.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <RelationGroup
            icon={<Layers3 className="h-3.5 w-3.5" aria-hidden="true" />}
            title="Epic"
            issues={[relationships?.epic].filter((issue): issue is RelatedIssue => Boolean(issue))}
          />
          <RelationGroup
            icon={<GitFork className="h-3.5 w-3.5" aria-hidden="true" />}
            title="Task cha"
            issues={[relationships?.parent].filter((issue): issue is RelatedIssue => Boolean(issue))}
          />
          <RelationGroup
            icon={<GitFork className="h-3.5 w-3.5" aria-hidden="true" />}
            title="Task con"
            issues={relationships?.children ?? []}
            action={childAction}
            emptyHint={isEpic ? "Chưa có task nào trong Epic này." : "Chưa có sub-task."}
          />
          <RelationGroup
            icon={<Link2 className="h-3.5 w-3.5" aria-hidden="true" />}
            title="Issue links"
            issues={relationships?.links ?? []}
            action={linkAction}
            emptyHint="Chưa liên kết với task nào."
          />
        </div>
      )}

      {canAct && issueKey && (
        <CreateChildDialog
          jiraKey={issueKey}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={async (child) => {
            setCreated(child);
            await onChanged?.();
          }}
        />
      )}
    </section>
  );
}
