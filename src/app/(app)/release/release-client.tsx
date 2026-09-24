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
import { Rocket, ShieldCheck, ShieldAlert, Plus, PackageOpen, Tag, Send } from "lucide-react";
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
type GateBlocker = { jiraKey?: string; source?: string; reason: string; url?: string };
type GateResult = {
  gate: string;
  state: "passed" | "failed" | "unknown" | "overridden";
  summary: string;
  blockers: GateBlocker[];
  sourceTime?: string;
  details?: Record<string, unknown>;
};
type Release = {
  id: string;
  version: string;
  projectKey: string;
  jiraVersionId?: string | null;
  targetLabel: string;
  status: "draft" | "checking" | "ready" | "blocked" | "unknown" | "released";
  notes: string;
  createdAt: string;
  releasedAt?: string | null;
  tasks: Task[];
};

const DONE_CATEGORIES = ["done"];

const GATE_LABELS: Record<string, string> = {
  non_empty_release: "Bản phát hành không rỗng",
  task_status: "Trạng thái task",
  critical_bugs: "Lỗi nghiêm trọng (Critical bugs)",
  sentry: "Lỗi Sentry",
  branches: "Trạng thái nhánh",
  pull_requests: "Pull Request",
  data_freshness: "Độ tươi mới dữ liệu",
  ci: "CI Build",
  manual_approval: "Phê duyệt thủ công",
  ai_advisory: "Tư vấn AI",
};

const STATUS_LABELS: Record<Release["status"], string> = {
  draft: "Bản nháp",
  checking: "Đang kiểm tra",
  ready: "Sẵn sàng",
  blocked: "Bị chặn",
  unknown: "Chưa rõ",
  released: "Đã phát hành",
};

const GATE_STATE_LABELS: Record<GateResult["state"], string> = {
  passed: "Đạt",
  failed: "Thất bại",
  unknown: "Chưa rõ",
  overridden: "Bỏ qua",
};

function gateVariant(state: GateResult["state"]): "success" | "danger" | "warning" | "secondary" {
  switch (state) {
    case "passed":
    case "overridden":
      return "success";
    case "failed":
      return "danger";
    case "unknown":
      return "warning";
    default:
      return "secondary";
  }
}

function gateLabel(gate: string): string {
  return GATE_LABELS[gate] ?? gate;
}

function StatusBadge({ status }: { status: Release["status"] }) {
  const map: Record<Release["status"], "secondary" | "success" | "danger" | "info" | "warning"> = {
    draft: "secondary",
    checking: "secondary",
    ready: "success",
    blocked: "danger",
    unknown: "warning",
    released: "info",
  };
  return <Badge variant={map[status] ?? "secondary"}>{STATUS_LABELS[status] ?? status}</Badge>;
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
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<
    Record<string, { ready: boolean; status: string; blockers: GateBlocker[]; gates: GateResult[] }>
  >({});

  // REL-02 — release a release only when its latest ready-check is ready.
  async function publishRelease(rel: Release) {
    if (releasingId) return; // double-click guard
    setReleaseError(null);
    const ok = window.confirm(
      `Phát hành ${rel.projectKey} v${rel.version}?\n\n` +
        `Task: ${rel.tasks.filter((t) => DONE_CATEGORIES.includes(t.issue.statusCategory)).length}/${rel.tasks.length} hoàn thành\n` +
        "Thao tác này sẽ đánh dấu Jira Fix Version là đã phát hành. Hành động này không thể hoàn tác dễ dàng."
    );
    if (!ok) return;
    setReleasingId(rel.id);
    try {
      const r = await api<{ ok: boolean; already?: boolean; error?: string }>(
        `/api/releases/${rel.id}/release`,
        { method: "POST", body: {} }
      );
      if (!r.ok) setReleaseError(r.error ?? "Phát hành thất bại");
      qc.invalidateQueries({ queryKey: ["releases"] });
    } catch (e) {
      setReleaseError((e as Error).message);
    } finally {
      setReleasingId(null);
    }
  }

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
      const r = await api<{
        ready: boolean;
        status: string;
        blockers: GateBlocker[];
        gates: GateResult[];
      }>(`/api/releases/${id}/ready`, { method: "POST", body: {} });
      setLastCheck((prev) => ({
        ...prev,
        [id]: { ready: r.ready, status: r.status, blockers: r.blockers ?? [], gates: r.gates ?? [] },
      }));
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
          <h1 className="text-xl font-semibold">Phát hành</h1>
          <p className="text-sm text-muted-foreground">
            Gộp task theo nhãn phát hành, sau đó chạy kiểm tra sẵn sàng (quy tắc + AI).
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5"><Plus className="h-4 w-4" /> Tạo bản phát hành</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tạo bản phát hành mới</DialogTitle>
              <DialogDescription>
                Bản phát hành được liên kết với một Jira Fix Version. Các task có Fix Version
                này sẽ được gộp vào. Để trống “Liên kết Fix Version” nếu muốn tạo
                mới Fix Version trên Jira.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="version">Phiên bản</Label>
                <Input id="version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.4.2" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="projectKey">Dự án Jira</Label>
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
                <Label htmlFor="linkVersion">Liên kết Fix Version</Label>
                {projectKey.trim() ? (
                  versions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {versionsLoading ? "Đang tải…" : "Chưa có Fix Version nào — một phiên bản mới sẽ được tạo."}
                    </p>
                  ) : (
                    <Select
                      value={linkVersionId}
                      onValueChange={setLinkVersionId}
                    >
                      <SelectTrigger id="linkVersion">
                        <SelectValue placeholder="Tạo một Fix Version mới" />
                      </SelectTrigger>
                      <SelectContent>
                        {versions.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                            {v.released ? " (đã phát hành)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">Chọn một dự án để liên kết Fix Version có sẵn.</p>
                )}
              </div>
              {projectKey.trim() && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="description">Mô tả</Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Mô tả tuỳ chọn cho Fix Version"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={createRelease} disabled={!version.trim() || versionsLoading}>
                Tạo mới
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
            <p className="text-sm font-medium">Chưa có bản phát hành nào</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Tạo bản phát hành gắn với Jira Fix Version, sau đó chạy kiểm tra sẵn sàng phát hành (ready-check).
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={checkingId === rel.id}
                    onClick={() => checkReady(rel.id)}
                    className="gap-1.5"
                  >
                    {check?.ready ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <ShieldAlert className="h-4 w-4" />}
                    {checkingId === rel.id ? "Đang kiểm tra…" : "Kiểm tra sẵn sàng"}
                  </Button>
                  {rel.status !== "released" && check?.ready && (
                    <Button
                      size="sm"
                      disabled={releasingId === rel.id}
                      onClick={() => publishRelease(rel)}
                      className="gap-1.5"
                    >
                      <Send className="h-4 w-4" />
                      {releasingId === rel.id ? "Đang phát hành…" : "Phát hành phiên bản"}
                    </Button>
                  )}
                </div>
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
                <span>{done}/{rel.tasks.length} hoàn thành</span>
                <span>·</span>
                <span>{timeAgo(rel.createdAt)}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {releaseError && (
                <div className="rounded-md border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
                  Phát hành thất bại: {releaseError}
                </div>
              )}
              {rel.status === "released" && (
                <div className="rounded-md border border-sky-300/40 bg-sky-500/10 p-3 text-sm text-sky-700 dark:text-sky-400">
                  Đã phát hành{rel.releasedAt ? ` ${timeAgo(rel.releasedAt)}` : ""}.
                </div>
              )}
              {check && (
                <div
                  className={
                    "rounded-md border p-3 text-sm " +
                    (check.ready
                      ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "border-red-300/40 bg-red-500/10")
                  }
                >
                  <p className="font-medium">
                    {check.ready ? "Sẵn sàng phát hành" : `Chưa sẵn sàng (${check.status})`}
                  </p>
                  {check.gates.length > 0 && (
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {check.gates.map((g, i) => (
                        <div
                          key={`${g.gate}-${i}`}
                          className="flex items-start gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5"
                        >
                          <Badge variant={gateVariant(g.state)} className="mt-0.5 shrink-0">
                            {GATE_STATE_LABELS[g.state] ?? g.state}
                          </Badge>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-foreground">
                              {gateLabel(g.gate)}
                            </p>
                            <p className="truncate text-xs text-muted-foreground" title={g.summary}>
                              {g.summary}
                            </p>
                            {g.blockers.length > 0 && (
                              <ul className="mt-0.5 list-inside list-disc text-xs text-muted-foreground">
                                {g.blockers.slice(0, 3).map((b, j) => (
                                  <li key={j} className="truncate" title={b.reason}>
                                    {b.jiraKey ? `${b.jiraKey}: ${b.reason}` : b.reason}
                                  </li>
                                ))}
                                {g.blockers.length > 3 && (
                                  <li className="text-muted-foreground/70">
                                    +{g.blockers.length - 3} mục khác
                                  </li>
                                )}
                              </ul>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-1.5">Task</th>
                    <th>Tóm tắt</th>
                    <th>Trạng thái</th>
                    <th>Điểm story</th>
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
