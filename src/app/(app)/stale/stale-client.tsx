"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Clock } from "lucide-react";

type Rank = { assignee: string; count: number; totalDays: number };
type Task = { jiraKey: string; assignee: string | null; ageDays: number };

export function StaleClient() {
  const { data, isLoading } = useQuery({
    queryKey: ["stale"],
    queryFn: () => api<{ ranking: Rank[]; tasks: Task[] }>("/api/stale"),
    refetchInterval: 60000,
    retry: 1,
  });

  const ranking = data?.ranking ?? [];
  const maxDays = Math.max(1, ...ranking.map((r) => r.totalDays));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Stale task ranking</h1>
        <p className="text-sm text-muted-foreground">
          Who has the most neglected tasks (idle &gt; configured days, not Done).
        </p>
      </div>

      {isLoading && (
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-6" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-2 h-2 w-full" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {ranking.length === 0 && !isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Clock className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No stale tasks</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              No tasks have been idle past the configured threshold.
            </p>
          </CardContent>
        </Card>
      )}

      {ranking.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy className="h-4 w-4" /> Leaderboard</CardTitle>
            <CardDescription>Ranked by total idle days across stale tasks.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {ranking.map((r, i) => (
              <div key={r.assignee} className="flex items-center gap-3">
                <span className="w-6 text-center text-sm font-semibold text-muted-foreground">#{i + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.assignee}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.count} task(s) · {r.totalDays}d
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{ width: `${(r.totalDays / maxDays) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data?.tasks && data.tasks.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Stale tasks</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1.5">Task</th>
                  <th>Assignee</th>
                  <th>Idle</th>
                </tr>
              </thead>
              <tbody>
                {data.tasks
                  .sort((a, b) => b.ageDays - a.ageDays)
                  .map((t) => (
                    <tr key={t.jiraKey} className="border-b last:border-0">
                      <td className="py-1.5"><Link href={`/issue/${t.jiraKey}`} className="font-mono text-xs hover:underline">{t.jiraKey}</Link></td>
                      <td>{t.assignee ?? "—"}</td>
                      <td><Badge variant="warning">{t.ageDays}d</Badge></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
