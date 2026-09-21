"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/utils";
import { GitBranch, RefreshCw } from "lucide-react";

type BranchRow = {
  id: string;
  repo: string;
  branch: string;
  lastCommitAt: string | null;
  prId: number | null;
  merged: boolean;
  checkedAt: string;
};

export function BranchesClient() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["branches"],
    queryFn: () => api<{ items: BranchRow[] }>("/api/branches"),
    refetchInterval: 30000,
    retry: 1,
  });
  const [onlyUnmerged, setOnlyUnmerged] = useState(false);

  const items = (data?.items ?? []).filter((b) => !onlyUnmerged || !b.merged);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Branches</h1>
          <p className="text-sm text-muted-foreground">
            Bitbucket branches not yet merged into the base branch.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyUnmerged}
            onChange={(e) => setOnlyUnmerged(e.target.checked)}
          />
          Unmerged only
        </label>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><GitBranch className="h-4 w-4" /> Tracked branches</CardTitle>
            <button onClick={() => refetch()} className="text-sm text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <CardDescription>
            Set <code className="rounded bg-muted px-1 text-xs">BITBUCKET_REPOS</code> to populate this view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          )}
          {!isLoading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <GitBranch className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No branches tracked yet</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Set <code className="rounded bg-muted px-1 text-xs">BITBUCKET_REPOS</code> to start tracking branches.
              </p>
            </div>
          )}
          {items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1.5">Branch</th>
                  <th>Repo</th>
                  <th>PR</th>
                  <th>Last commit</th>
                  <th>Status</th>
                  <th>Checked</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="py-1.5 font-mono text-xs">{b.branch}</td>
                    <td className="text-xs">{b.repo}</td>
                    <td className="text-xs">{b.prId ?? "—"}</td>
                    <td className="text-xs text-muted-foreground">{timeAgo(b.lastCommitAt)}</td>
                    <td>{b.merged ? <Badge variant="success">merged</Badge> : <Badge variant="danger">open</Badge>}</td>
                    <td className="text-xs text-muted-foreground">{timeAgo(b.checkedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
