import { Button } from "@/components/ui/button";
import type { IssueItem } from "@/hooks/use-issues";
import { timeAgo } from "@/lib/utils";

function dateLabel(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** Table view of all loaded issues with a "load more" footer. */
export function BoardListView({
  issues,
  hiddenTableCols,
  hasMore,
  loadingMore,
  onOpen,
  onLoadMore,
}: {
  issues: IssueItem[];
  hiddenTableCols: Set<string>;
  hasMore: boolean;
  loadingMore: boolean;
  onOpen: (issue: IssueItem) => void;
  onLoadMore: () => void;
}) {
  return (
    <div className="flex-1 overflow-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Key</th>
            <th className="px-3 py-2 font-medium">Summary</th>
            {!hiddenTableCols.has("type") && <th className="px-3 py-2 font-medium">Type</th>}
            {!hiddenTableCols.has("points") && <th className="px-3 py-2 font-medium">Points</th>}
            {!hiddenTableCols.has("status") && <th className="px-3 py-2 font-medium">Status</th>}
            {!hiddenTableCols.has("assignee") && <th className="px-3 py-2 font-medium">Assignee</th>}
            {!hiddenTableCols.has("priority") && <th className="px-3 py-2 font-medium">Priority</th>}
            {!hiddenTableCols.has("due") && <th className="px-3 py-2 font-medium">Due</th>}
            {!hiddenTableCols.has("epic") && <th className="px-3 py-2 font-medium">Epic</th>}
            {!hiddenTableCols.has("fixVersion") && <th className="px-3 py-2 font-medium">Fix version</th>}
            {!hiddenTableCols.has("reporter") && <th className="px-3 py-2 font-medium">Reporter</th>}
            {!hiddenTableCols.has("approver") && <th className="px-3 py-2 font-medium">Approver</th>}
            {!hiddenTableCols.has("tester") && <th className="px-3 py-2 font-medium">Tester</th>}
            {!hiddenTableCols.has("created") && <th className="px-3 py-2 font-medium">Created</th>}
            {!hiddenTableCols.has("updated") && <th className="px-3 py-2 font-medium">Updated</th>}
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <tr
              key={issue.jiraKey}
              className="cursor-pointer border-t transition-colors hover:bg-muted/30"
              onClick={() => onOpen(issue)}
            >
              <td className="px-3 py-2 font-mono text-xs text-primary">{issue.jiraKey}</td>
              <td className="max-w-xs truncate px-3 py-2 font-medium">{issue.summary}</td>
              {!hiddenTableCols.has("type") && <td className="px-3 py-2 text-muted-foreground">{issue.type || "—"}</td>}
              {!hiddenTableCols.has("points") && <td className="px-3 py-2 tabular-nums text-muted-foreground">{issue.points ?? "—"}</td>}
              {!hiddenTableCols.has("status") && (
                <td className="px-3 py-2 text-muted-foreground">{issue.status}</td>
              )}
              {!hiddenTableCols.has("assignee") && (
                <td className="px-3 py-2 text-muted-foreground">{issue.assigneeJira ?? "—"}</td>
              )}
              {!hiddenTableCols.has("priority") && (
                <td className="px-3 py-2 text-muted-foreground">{issue.priority ?? "—"}</td>
              )}
              {!hiddenTableCols.has("due") && (
                <td className={issue.dueDate && new Date(issue.dueDate) < new Date() && issue.statusCategory !== "done" ? "px-3 py-2 font-medium text-destructive" : "px-3 py-2 text-muted-foreground"}>{dateLabel(issue.dueDate)}</td>
              )}
              {!hiddenTableCols.has("epic") && <td className="px-3 py-2 text-muted-foreground">{issue.epic ?? "—"}</td>}
              {!hiddenTableCols.has("fixVersion") && <td className="max-w-40 truncate px-3 py-2 text-muted-foreground">{issue.fixVersionNames.join(", ") || "—"}</td>}
              {!hiddenTableCols.has("reporter") && <td className="px-3 py-2 text-muted-foreground">{issue.reporterJira ?? "—"}</td>}
              {!hiddenTableCols.has("approver") && <td className="px-3 py-2 text-muted-foreground">{issue.approverJira ?? "—"}</td>}
              {!hiddenTableCols.has("tester") && <td className="px-3 py-2 text-muted-foreground">{issue.testerJira ?? "—"}</td>}
              {!hiddenTableCols.has("created") && <td className="px-3 py-2 text-muted-foreground">{dateLabel(issue.createdAt)}</td>}
              {!hiddenTableCols.has("updated") && (
                <td className="px-3 py-2 text-muted-foreground">{timeAgo(issue.updatedAt)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <div className="border-t p-3 text-center">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Đang tải…" : "Xem thêm"}
          </Button>
        </div>
      )}
    </div>
  );
}
