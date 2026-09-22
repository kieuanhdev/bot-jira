"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Clock,
  Users,
  Lock,
  TrendingUp,
  Filter,
  Inbox,
} from "lucide-react";

type Severity = "info" | "warning" | "high";

interface Task {
  jiraKey: string;
  projectKey: string;
  summary: string;
  status: string;
  statusGroup: string;
  assigneeJira: string | null;
  type: string;
  priority: string;
  totalAgeDays: number;
  stateAgeDays: number;
  inactiveDays: number;
  blockedDays: number;
  staleReason: string;
  staleReasonLabel: string;
  severity: Severity;
  slaDays: number;
  overByDays: number;
  labels: string[];
}

interface Bottleneck {
  status: string;
  group: string;
  count: number;
  avgStateAge: number;
  totalOverBy: number;
}

interface SupportEntry {
  assignee: string;
  taskCount: number;
  reasons: { reason: string; label: string; count: number }[];
  avgStateAge: number;
}

interface BlockedTask {
  jiraKey: string;
  summary: string;
  status: string;
  assigneeJira: string | null;
  blockedDays: number;
  reason: string;
  reasonLabel: string;
}

interface TrendPoint {
  week: string;
  count: number;
}

interface Summary {
  totalStale: number;
  totalBlocked: number;
  totalNoAssignee: number;
  worstOverBy: number;
}

interface StaleResponse {
  tasks: Task[];
  bottleneck: Bottleneck[];
  support: SupportEntry[];
  blocked: BlockedTask[];
  trend: TrendPoint[];
  filters: {
    assignees: string[];
    statuses: string[];
    reasons: string[];
    reasonLabels: Record<string, string>;
  };
  summary: Summary;
}

const SEVERITY_VARIANT: Record<Severity, "info" | "warning" | "danger"> = {
  info: "info",
  warning: "warning",
  high: "danger",
};

const GROUP_DOT: Record<string, string> = {
  Backlog: "bg-muted-foreground/50",
  "To Do": "bg-sky-500",
  "In Progress": "bg-primary",
  "In Review": "bg-amber-500",
  Done: "bg-emerald-500",
};

function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge variant={SEVERITY_VARIANT[severity]}>{severity}</Badge>;
}

function SummaryTile({ icon: Icon, label, value, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {sub && <p className="text-xs text-muted-foreground/70">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function TrendBar({ points }: { points: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="flex h-32 items-end gap-2">
      {points.map((p) => (
        <div key={p.week} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs tabular-nums text-muted-foreground">{p.count}</span>
          <div
            className="w-full rounded-t-sm bg-primary/60 transition-all"
            style={{ height: `${(p.count / max) * 100}%`, minHeight: p.count > 0 ? 4 : 2 }}
          />
          <span className="text-[10px] text-muted-foreground/70">
            {p.week.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StaleClient() {
  const [assignee, setAssignee] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState("");

  const params = new URLSearchParams();
  if (assignee) params.set("assignee", assignee);
  if (status) params.set("status", status);
  if (reason) params.set("reason", reason);
  if (severity) params.set("severity", severity);
  const qs = params.toString();

  const { data, isLoading } = useQuery({
    queryKey: ["stale", assignee, status, reason, severity],
    queryFn: () => api<StaleResponse>(`/api/stale${qs ? `?${qs}` : ""}`),
    refetchInterval: 60_000,
    retry: 1,
  });

  const summary = data?.summary;
  const hasFilters = assignee || status || reason || severity;

  const clearFilters = () => {
    setAssignee("");
    setStatus("");
    setReason("");
    setSeverity("");
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Stale analytics</h1>
        <p className="text-sm text-muted-foreground">
          Bottleneck and waiting-reason view — not a personal ranking.
        </p>
      </div>

      {/* Summary tiles */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      )}
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryTile icon={AlertTriangle} label="Tasks over SLA" value={summary.totalStale} />
          <SummaryTile icon={Lock} label="Blocked" value={summary.totalBlocked} />
          <SummaryTile icon={Users} label="No assignee" value={summary.totalNoAssignee} />
          <SummaryTile icon={Clock} label="Worst over-by" value={summary.worstOverBy} sub="days past SLA" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" aria-hidden />
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            {(data?.filters.assignees ?? []).map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(data?.filters.statuses ?? []).map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Reason" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reasons</SelectItem>
            {(data?.filters.reasons ?? []).map((r) => (
              <SelectItem key={r} value={r}>
                {data?.filters.reasonLabels[r] ?? r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severity</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="cursor-pointer text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      )}

      {!isLoading && !data && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No stale data</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              No tasks are currently exceeding their SLA thresholds.
            </p>
          </CardContent>
        </Card>
      )}

      {data && data.tasks.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No stale tasks{hasFilters ? " match filters" : ""}</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {hasFilters
                ? "Try adjusting or clearing the filters."
                : "No tasks have exceeded their per-status SLA."}
            </p>
          </CardContent>
        </Card>
      )}

      {data && data.tasks.length > 0 && (
        <>
          {/* Bottleneck by status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Bottleneck by status</CardTitle>
              <CardDescription className="text-xs">
                Where tasks are stuck, ranked by count.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data.bottleneck.map((b) => (
                <div key={b.status} className="flex items-center gap-3">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${GROUP_DOT[b.group] ?? "bg-muted-foreground/50"}`}
                    aria-hidden
                  />
                  <span className="w-32 truncate text-sm font-medium">{b.status}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/60"
                      style={{ width: `${(b.count / data.bottleneck[0].count) * 100}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                    {b.count} task{b.count !== 1 ? "s" : ""} · avg {b.avgStateAge}d
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Weekly trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4" /> Weekly trend
              </CardTitle>
              <CardDescription className="text-xs">
                Tasks that entered their current state per week (last 8 weeks).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrendBar points={data.trend} />
            </CardContent>
          </Card>

          {/* People needing support */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4" /> People with stuck tasks
              </CardTitle>
              <CardDescription className="text-xs">
                Grouped by waiting reason — not a performance ranking.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {data.support.map((s) => (
                <div key={s.assignee} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{s.assignee}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {s.taskCount} task{s.taskCount !== 1 ? "s" : ""} · avg {s.avgStateAge}d
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {s.reasons.map((r) => (
                      <Badge key={r.reason} variant="secondary" className="text-[11px]">
                        {r.label} ({r.count})
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Longest blocked */}
          {data.blocked.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Lock className="h-4 w-4" /> Longest blocked
                </CardTitle>
                <CardDescription className="text-xs">
                  Tasks in a blocked state, sorted by time blocked.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1">
                  {data.blocked.map((b) => (
                    <div key={b.jiraKey} className="flex items-center justify-between border-b border-border/50 py-1.5 last:border-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link href={`/issue/${b.jiraKey}`} className="font-mono text-xs hover:underline">
                          {b.jiraKey}
                        </Link>
                        <span className="truncate text-xs text-muted-foreground">{b.summary}</span>
                      </div>
                      <div className="ml-2 flex shrink-0 items-center gap-2">
                        <Badge variant="secondary" className="text-[11px]">{b.reasonLabel}</Badge>
                        <Badge variant="danger" className="text-[11px]">{b.blockedDays}d</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Task table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">All stale tasks</CardTitle>
              <CardDescription className="text-xs">
                {data.tasks.length} task{data.tasks.length !== 1 ? "s" : ""} exceeding their SLA.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-1.5 pr-2">Task</th>
                      <th className="pr-2">Status</th>
                      <th className="pr-2">Assignee</th>
                      <th className="pr-2">Reason</th>
                      <th className="pr-2 text-right">State age</th>
                      <th className="pr-2 text-right">SLA</th>
                      <th className="text-right">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tasks
                      .sort((a, b) => b.overByDays - a.overByDays)
                      .map((t) => (
                        <tr key={t.jiraKey} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">
                            <Link href={`/issue/${t.jiraKey}`} className="font-mono text-xs hover:underline">
                              {t.jiraKey}
                            </Link>
                            <p className="max-w-[160px] truncate text-xs text-muted-foreground">{t.summary}</p>
                          </td>
                          <td className="pr-2">
                            <span className="flex items-center gap-1.5">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${GROUP_DOT[t.statusGroup] ?? "bg-muted-foreground/50"}`}
                                aria-hidden
                              />
                              <span className="text-xs">{t.status}</span>
                            </span>
                          </td>
                          <td className="pr-2 text-xs">{t.assigneeJira ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="pr-2"><Badge variant="secondary" className="text-[11px]">{t.staleReasonLabel}</Badge></td>
                          <td className="pr-2 text-right tabular-nums">{t.stateAgeDays}d</td>
                          <td className="pr-2 text-right text-xs tabular-nums text-muted-foreground">{t.slaDays}d (+{t.overByDays})</td>
                          <td className="text-right"><SeverityBadge severity={t.severity as Severity} /></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
