import Link from "next/link";
import { ExternalLink, GitBranch, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, timeAgo, getBitbucketBranchUrl } from "@/lib/utils";
import type { BranchRow } from "./lib/issue-detail-types";

interface IssueDetailTabsBranchesProps {
  jiraKey: string;
  branches?: {
    items: BranchRow[];
    suggestedItems?: (BranchRow & { id: string })[];
    bitbucketBaseUrl?: string | null;
  };
  bitbucketBaseUrl: string;
  syncPending: boolean;
  onSync: () => void;
  onConfirmBranch: (branchId: string) => void;
  onRejectBranch: (branchId: string) => void;
}

export function IssueDetailTabsBranches({
  jiraKey,
  branches,
  bitbucketBaseUrl,
  syncPending,
  onSync,
  onConfirmBranch,
  onRejectBranch,
}: IssueDetailTabsBranchesProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" /> Các nhánh liên quan
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={onSync}
            disabled={syncPending}
            title="Đồng bộ các nhánh và Pull Request trực tiếp từ Jira Development Panel"
          >
            <RefreshCw className={cn("h-3 w-3", syncPending && "animate-spin")} />
            {syncPending ? "Đang đồng bộ..." : "Đồng bộ Jira"}
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
            <Link href={`/branches?q=${encodeURIComponent(jiraKey)}`}>
              Xem trong mục Nhánh →
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {branches?.items?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pl-1">Nhánh</th>
                  <th>Repository</th>
                  <th>Pull Request</th>
                  <th>Trạng thái</th>
                  <th>Hoạt động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {branches.items.map((b, i) => {
                  const branchUrl = getBitbucketBranchUrl(b.repo, b.branch, bitbucketBaseUrl, b.prUrl);
                  return (
                    <tr key={i} className="last:border-0 hover:bg-muted/30">
                      <td className="py-2 pl-1 font-mono text-xs font-semibold">
                        {branchUrl ? (
                          <a
                            href={branchUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1.5 cursor-pointer font-semibold"
                            title={`Xem nhánh ${b.branch} trên Git`}
                          >
                            <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                            <span>{b.branch}</span>
                            <ExternalLink className="h-3 w-3 opacity-60 shrink-0" aria-hidden="true" />
                          </a>
                        ) : (
                          <div className="flex items-center gap-1.5 text-foreground">
                            <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                            <span>{b.branch}</span>
                          </div>
                        )}
                      </td>
                      <td className="text-xs text-muted-foreground">{b.repo}</td>
                      <td className="text-xs">
                        {b.prState ? (
                          <div className="flex items-center gap-1.5">
                            {b.prUrl ? (
                              <a
                                href={b.prUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                                title="Mở Pull Request trên Git"
                              >
                                <span>#{b.prId}</span>
                                <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
                              </a>
                            ) : (
                              <span>#{b.prId}</span>
                            )}
                            <Badge
                              variant={
                                b.prState === "OPEN"
                                  ? "info"
                                  : b.prState === "MERGED"
                                  ? "success"
                                  : b.prState === "DECLINED"
                                  ? "danger"
                                  : "outline"
                              }
                              className="h-4 px-1 text-[10px]"
                            >
                              {b.prState}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Chưa có PR</span>
                        )}
                      </td>
                      <td>
                        {b.merged ? (
                          <Badge variant="success">đã merge</Badge>
                        ) : (
                          <Badge variant="outline">đang hoạt động</Badge>
                        )}
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {timeAgo(b.lastCommitAt ?? b.checkedAt ?? null)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <GitBranch className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Chưa có nhánh nào được liên kết</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Các nhánh Bitbucket chứa mã issue này sẽ tự động được liên kết, hoặc bạn có thể đồng bộ ngay từ Jira.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 text-xs gap-1.5"
              onClick={onSync}
              disabled={syncPending}
            >
              <RefreshCw className={cn("h-3 w-3", syncPending && "animate-spin")} />
              {syncPending ? "Đang đồng bộ..." : "Đồng bộ từ Jira ngay"}
            </Button>
          </div>
        )}

        {/* Suggested Branches Section if any */}
        {branches?.suggestedItems && branches.suggestedItems.length > 0 && (
          <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Nhánh gợi ý ({branches.suggestedItems.length})
              </span>
              <Button asChild variant="outline" size="sm" className="h-6 text-xs border-amber-500/30 text-amber-600 dark:text-amber-400">
                <Link href={`/branches?link=suggested&q=${encodeURIComponent(jiraKey)}`}>
                  Xem xét trong mục Nhánh →
                </Link>
              </Button>
            </div>
            <div className="divide-y divide-amber-500/20 text-xs">
              {branches.suggestedItems.map((sb, idx) => {
                const sbUrl = getBitbucketBranchUrl(sb.repo, sb.branch, bitbucketBaseUrl, sb.prUrl);
                return (
                  <div key={idx} className="flex items-center justify-between py-2 gap-2">
                    <div className="flex flex-col gap-0.5 font-mono">
                      {sbUrl ? (
                        <a
                          href={sbUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                          title={`Xem nhánh ${sb.branch} trên Git`}
                        >
                          <span>{sb.branch}</span>
                          <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="font-semibold text-foreground">{sb.branch}</span>
                      )}
                      <span className="text-[11px] text-muted-foreground">{sb.repo}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="warning">Chờ xác nhận</Badge>
                      {sb.id && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onConfirmBranch(sb.id!)}
                            className="h-6 px-2 text-[11px] bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 border-teal-500/30 cursor-pointer"
                          >
                            Xác nhận
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onRejectBranch(sb.id!)}
                            className="h-6 px-2 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
                          >
                            Từ chối
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
