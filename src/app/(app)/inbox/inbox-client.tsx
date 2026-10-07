"use client";

import { CheckCheck, ChevronRight } from "lucide-react";
import { useIssues, isMembershipPending } from "@/hooks/use-issues";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { isOverdue } from "@/lib/due-date";

/** Statuses that mean "a tester should pick this up" (ToDo Test / To Do Test / READY FOR TEST). */
const AWAITING_TEST = /to\s?do test|ready for test/i;

export function InboxClient() {
  const { data, isLoading } = useIssues({ role: "tester", includeDone: false, limit: 1000 });
  const issues = data && !isMembershipPending(data)
    ? data.items
        .filter((issue) => AWAITING_TEST.test(issue.status))
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    : [];

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Chờ tôi test</h1>
        <p className="text-sm text-muted-foreground">Các task đang chờ bạn kiểm thử, hạn gần nhất lên trước.</p>
      </div>
      {issues.length === 0 ? (
        <EmptyState icon={CheckCheck} title="Không có task đang chờ test" hint="Các task bạn là Tester và đã sẵn sàng để test sẽ xuất hiện tại đây." />
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {issues.map((issue) => (
            <a key={issue.jiraKey} href={`/issue/${issue.jiraKey}`} className="flex cursor-pointer items-start gap-3 p-3 transition-colors hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-primary">{issue.jiraKey}</span>
                  <Badge variant="secondary">{issue.status}</Badge>
                  {isOverdue(issue.dueDate, false) && <Badge variant="danger">Quá hạn</Badge>}
                </div>
                <p className="mt-1 truncate text-sm font-medium">{issue.summary}</p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground" aria-hidden />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
