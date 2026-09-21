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
import { Rocket, ShieldCheck, ShieldAlert, Plus, PackageOpen, Tag } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Task = {
  jiraKey: string;
  issue: {
    status: string;
    statusCategory: string;
    summary: string;
    points: number | null;
    priority: string;
  };
};
type JiraVersion = { id: string; name: string; released?: boolean };
type Release = {
  id: string;
  version: string;
  projectKey: string;
  jiraVersionId?: string | null;
  targetLabel: string;
  status: "draft" | "checking" | "ready" | "blocked" | "unknown" | "released";
  notes: string;
  createdAt: string;
  tasks: Task[];
};

const DONE_CATEGORIES = ["done"];

function StatusBadge({ status }: { status: Release["status"] }) {
  const map: Record<Release["status"], "secondary" | "success" | "danger" | "info" | "warning"> = {
    draft: "secondary",
    checking: "secondary",
    ready: "success",
    blocked: "danger",
    unknown: "warning",
    released: "info",
  };
  return <Badge variant={map[status] ?? "secondary"}>{status}</Badge>;
}

export function ReleaseClient() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [linkVersionId, setLinkVersionId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [versions, setVersions] = useState<JiraVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Record<string, { ready: boolean; blockers: { jiraKey?: string; reason: string }[] }>>({});

  const { data } = useQuery({
    queryKey: ["releases"],
    queryFn: () => api<{ items: Release[] }>("/api/releases"),
    refetchInterval: 30000,
    retry: 1,
  });

  // Load the available Jira Fix Versions for the selected project so the user
  // can link an existing version (or create a new one by leaving the link
  // empty). The versions proxy is per-release, so we fetch it from the first
  // existing release in that project.
  async function loadVersions(key: string) {
    if (!key) {
      setVersions([]);
      return;
    }
    setVersionsLoading(true);
    setVersions([]);
    try {
      const r = await api<{ items: Release[] }>(`/api/releases?projectKey=${encodeURIComponent(key)}`);
      const first = r.items?.find((rel) => rel.projectKey === key);
      if (first) {
        const v = await api<{ items: JiraVersion[] }>(`/api/releases/${first.id}/versions`);
        setVersions(v.items ?? []);
      }
    } catch {
      // No release yet for this project (or Jira unavailable) — the user can
      // still create a brand-new Fix Version by leaving the link empty.
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function createRelease() {
    if (!version.trim()) return;
    const body: Record<string, string> = { version: version.trim() };
    if (projectKey.trim()) {
      body.projectKey = projectKey.trim().toUpperCase();
      if (description.trim()) body.description = description.trim();
      if (linkVersionId) body.jiraVersionId = linkVersionId;
    }
    await api("/api/releases", { method: "POST", body });
    setVersion("");
    setProjectKey("");
    setLinkVersionId("");
    setDescription("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["releases"] });
  }

  async function checkReady(id: string) {
    setCheckingId(id);
    try {
      const r = await api<{ ready: boolean; blockers: { jiraKey?: string; reason: string }[] }>(
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
                A release is tied to a Jira Fix Version. Tasks whose issues carry
                that Fix Version are included. Leave “Link version” empty to create
                a new Fix Version in Jira.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="version">Version</Label>
                <Input id="version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.4.2" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="projectKey">Jira project</Label>
                <Input
                  id="projectKey"
                  value={projectKey}
                  onChange={(e) => {
                    const next = e.target.value.toUpperCase();
                    setProjectKey(next);
                    setLinkVersionId("");
                    loadVersions(next.trim());
                  }}
                  placeholder="EPM"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="linkVersion">Link Fix Version</Label>
                {projectKey.trim() ? (
                  versions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {versionsLoading ? "Loading…" : "No existing Fix Versions — a new one will be created."}
                    </p>
                  ) : (
                    <Select
                      value={linkVersionId}
                      onValueChange={setLinkVersionId}
                    >
                      <SelectTrigger id="linkVersion">
                        <SelectValue placeholder="Create a new Fix Version" />
                      </SelectTrigger>
                      <SelectContent>
                        {versions.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                            {v.released ? " (released)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">Pick a project to link an existing Fix Version.</p>
                )}
              </div>
              {projectKey.trim() && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description for the Fix Version"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={createRelease} disabled={!version.trim() || versionsLoading}>
                Create
              </Button>
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
              Create a release tied to a Jira Fix Version, then run a ready-check.
            </p>
          </CardContent>
        </Card>
      )}

      {releases.map((rel) => {
        const done = rel.tasks.filter((t) => DONE_CATEGORIES.includes(t.issue.statusCategory)).length;
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
              <CardDescription className="flex items-center gap-1.5">
                {rel.projectKey ? (
                  <span className="inline-flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" />
                    <code className="rounded bg-muted px-1 text-xs">{rel.projectKey}</code>
                    {rel.jiraVersionId ? (
                      <span className="text-xs text-muted-foreground">fix version</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" />
                    <code className="rounded bg-muted px-1 text-xs">{rel.targetLabel}</code>
                  </span>
                )}
                <span>·</span>
                <span>{done}/{rel.tasks.length} done</span>
                <span>·</span>
                <span>{timeAgo(rel.createdAt)}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {check && !check.ready && (
                <div className="rounded-md border border-red-300/40 bg-red-500/10 p-3 text-sm">
                  <p className="font-medium text-red-700 dark:text-red-400">Not ready to release</p>
                  <ul className="mt-1 list-inside list-disc text-red-700/90 dark:text-red-400/90">
                    {check.blockers.length === 0 && <li>{rel.status}</li>}
                    {check.blockers.map((b, i) => (
                      <li key={i}>{b.jiraKey ? `${b.jiraKey}: ${b.reason}` : b.reason}</li>
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
                      <td><Badge variant={DONE_CATEGORIES.includes(t.issue.statusCategory) ? "success" : "secondary"}>{t.issue.status}</Badge></td>
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
