"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useIssues } from "@/hooks/use-issues";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CheckCheck, Loader2 } from "lucide-react";

export function BulkClient() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignee, setAssignee] = useState("");
  const [label, setLabel] = useState("");
  const [priority, setPriority] = useState("");
  const [points, setPoints] = useState("");
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ key: string; ok: boolean; error?: string }[] | null>(null);

  const { data, isLoading } = useIssues({ includeDone: true });
  const issues = data?.items ?? [];

  const allSelected = issues.length > 0 && issues.every((i) => selected.has(i.jiraKey));

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(issues.map((i) => i.jiraKey)));
  }

  function buildAction(): { kind: string; value: unknown } | null {
    if (assignee) return { kind: "assign", value: assignee };
    if (label) return { kind: "add-labels", value: label.split(",").map((s) => s.trim()).filter(Boolean) };
    if (priority) return { kind: "set-priority", value: priority };
    if (points) return { kind: "set-points", value: Number(points) };
    if (status) return { kind: "transition", value: status };
    return null;
  }

  async function apply() {
    const action = buildAction();
    if (!action) return;
    setRunning(true);
    setResults(null);
    try {
      const r = await api<{ results: { key: string; ok: boolean; error?: string }[] }>(
        "/api/issues/bulk",
        { method: "POST", body: { keys: Array.from(selected), action } }
      );
      setResults(r.results);
      qc.invalidateQueries({ queryKey: ["issues"] });
    } catch (e) {
      setResults([{ key: "—", ok: false, error: (e as Error).message }]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Bulk edit</h1>
        <p className="text-sm text-muted-foreground">
          Select tasks and apply one metadata change at a time. Each change is pushed to Jira.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>
            Choose one action and a value, then apply to the {selected.size} selected task(s).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Assign to</span>
            <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="jira username" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Add labels (comma-sep)</span>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="release-1.4.2, frontend" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Set priority</span>
            <Select value={priority} onValueChange={(v) => setPriority(v === "ALL" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">—</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Highest">Highest</SelectItem>
                <SelectItem value="Blocker">Blocker</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Set points</span>
            <Select value={points} onValueChange={(v) => setPoints(v === "NONE" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Points" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">—</SelectItem>
                {[1, 2, 3, 5, 8, 13].map((p) => <SelectItem key={p} value={String(p)}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Move to status</span>
            <Input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="In Progress / In Review / Done" />
          </div>
          <div className="flex items-end">
            <Button onClick={apply} disabled={running || selected.size === 0 || !buildAction()}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Apply to {selected.size} task(s)
            </Button>
          </div>
        </CardContent>
      </Card>

      {results && (
        <Card>
          <CardHeader><CardTitle>Results</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {results.map((r, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Badge variant={r.ok ? "success" : "danger"}>{r.ok ? "ok" : "fail"}</Badge>
                  <span className="font-mono text-xs">{r.key}</span>
                  {r.error && <span className="text-xs text-muted-foreground">{r.error}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b p-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              Select all
            </label>
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {isLoading && (
              <div className="flex flex-col gap-2 p-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            )}
            {issues.map((i) => (
              <label
                key={i.jiraKey}
                className={cn(
                  "flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-0 hover:bg-accent/50",
                  selected.has(i.jiraKey) && "bg-accent/40"
                )}
              >
                <Checkbox checked={selected.has(i.jiraKey)} onCheckedChange={() => toggle(i.jiraKey)} />
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{i.jiraKey}</span>
                <span className="flex-1 truncate">{i.summary}</span>
                <Badge variant="secondary" className="shrink-0">{i.status}</Badge>
                {i.points != null && <Badge variant="outline" className="shrink-0">{i.points}pt</Badge>}
              </label>
            ))}
            {!isLoading && issues.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">No issues in cache.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
