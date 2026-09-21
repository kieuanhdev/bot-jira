"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { timeAgo } from "@/lib/utils";
import { Rocket, ShieldCheck, ShieldAlert, Plus, PackageOpen } from "lucide-react";

type Task = {
  jiraKey: string;
  issue: { status: string; summary: string; points: number | null; priority: string };
};
type Release = {
  id: string;
  version: string;
  targetLabel: string;
  status: "draft" | "ready" | "blocked" | "released";
  notes: string;
  createdAt: string;
  tasks: Task[];
};

const DONE_STATUSES = ["Done", "Closed", "Resolved", "Done/In Review"];

function StatusBadge({ status }: { status: Release["status"] }) {
  const map = {
    draft: "secondary" as const,
    ready: "success" as const,
    blocked: "danger" as const,
    released: "info" as const,
  };
  return <Badge variant={map[status]}>{status}</Badge>;
}

export function ReleaseClient() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState("");
  const [label, setLabel] = useState("");
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Record<string, { ready: boolean; blockers: { jiraKey: string; reason: string }[]; unfinishedCount: number }>>({});

  const { data } = useQuery({
    queryKey: ["releases"],
    queryFn: () => api<{ items: Release[] }>("/api/releases"),
    refetchInterval: 30000,
    retry: 1,
  });

  async function createRelease() {
    if (!version || !label) return;
    await api("/api/releases", { method: "POST", body: { version, targetLabel: label } });
    setVersion("");
    setLabel("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["releases"] });
  }

  async function checkReady(id: string) {
    setCheckingId(id);
    try {
      const r = await api<{ ready: boolean; blockers: { jiraKey: string; reason: string }[]; unfinishedCount: number }>(
        `/api/releases/${id}/ready`,
        { method: "POST", body: {} }
      );
      setLastCheck((prev) => ({ ...prev, [id]: r }));
    } finally {
      setCheckingId(null);
    }
    qc.invalidateQueries({ queryKey: ["releases"] });
  }

  const releases = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Releases</h1>
          <p className="text-sm text-muted-foreground">
            Group tasks by release label, then run a ready-check (rules + AI).
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5"><Plus className="h-4 w-4" /> New release</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New release</DialogTitle>
              <DialogDescription>
                A release is tied to a Jira label. Tasks carrying that label are included.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="version">Version</Label>
                <Input id="version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.4.2" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="label">Target label</Label>
                <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="release-1.4.2" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createRelease}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {releases.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <PackageOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No releases yet</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Create a release to group tasks by a Jira label and run a ready-check.
            </p>
          </CardContent>
        </Card>
      )}

      {releases.map((rel) => {
        const done = rel.tasks.filter((t) => DONE_STATUSES.includes(t.issue.status)).length;
        const check = lastCheck[rel.id];
        return (
          <Card key={rel.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Rocket className="h-5 w-5" />
                  <CardTitle className="text-lg">v{rel.version}</CardTitle>
                  <StatusBadge status={rel.status} />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={checkingId === rel.id}
                  onClick={() => checkReady(rel.id)}
                  className="gap-1.5"
                >
                  {check?.ready ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <ShieldAlert className="h-4 w-4" />}
                  {checkingId === rel.id ? "Checking…" : "Run ready-check"}
                </Button>
              </div>
              <CardDescription>
                label <code className="rounded bg-muted px-1 text-xs">{rel.targetLabel}</code> · {done}/{rel.tasks.length} done · {timeAgo(rel.createdAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {check && !check.ready && (
                <div className="rounded-md border border-red-300/40 bg-red-500/10 p-3 text-sm">
                  <p className="font-medium text-red-700 dark:text-red-400">Not ready to release</p>
                  <ul className="mt-1 list-inside list-disc text-red-700/90 dark:text-red-400/90">
                    {check.unfinishedCount > 0 && (
                      <li>{check.unfinishedCount} task(s) not in Done/In Review</li>
                    )}
                    {check.blockers.map((b, i) => (
                      <li key={i}>{b.jiraKey}: {b.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              {check && check.ready && (
                <div className="rounded-md border border-emerald-300/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                  All tasks done and no blocking bugs detected. Release looks good.
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-1.5">Task</th>
                    <th>Summary</th>
                    <th>Status</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {rel.tasks.map((t) => (
                    <tr key={t.jiraKey} className="border-b last:border-0">
                      <td className="py-1.5"><Link href={`/issue/${t.jiraKey}`} className="font-mono text-xs hover:underline">{t.jiraKey}</Link></td>
                      <td className="line-clamp-1">{t.issue.summary}</td>
                      <td><Badge variant={DONE_STATUSES.includes(t.issue.status) ? "success" : "secondary"}>{t.issue.status}</Badge></td>
                      <td>{t.issue.points ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
