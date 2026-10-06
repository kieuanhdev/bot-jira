import { Button } from "@/components/ui/button";
import type { IssueItem } from "@/hooks/use-issues";
import { timeAgo } from "@/lib/utils";

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
            {!hiddenTableCols.has("status") && <th className="px-3 py-2 font-medium">Status</th>}
            {!hiddenTableCols.has("assignee") && <th className="px-3 py-2 font-medium">Assignee</th>}
            {!hiddenTableCols.has("priority") && <th className="px-3 py-2 font-medium">Priority</th>}
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
              {!hiddenTableCols.has("status") && (
                <td className="px-3 py-2 text-muted-foreground">{issue.status}</td>
              )}
              {!hiddenTableCols.has("assignee") && (
                <td className="px-3 py-2 text-muted-foreground">{issue.assigneeJira ?? "—"}</td>
              )}
              {!hiddenTableCols.has("priority") && (
                <td className="px-3 py-2 text-muted-foreground">{issue.priority ?? "—"}</td>
              )}
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
