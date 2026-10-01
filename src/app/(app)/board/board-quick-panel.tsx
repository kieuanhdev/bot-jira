"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { cn, timeAgo, formatDateTime, getJiraIssueUrl, getBitbucketBranchUrl } from "@/lib/utils";
import { wikiToHtml } from "@/lib/wiki";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Bot,
  Clock,
  Copy,
  Check,
  X,
  CornerDownLeft,
  GitBranch,
  User,
  UserCheck,
  Flag,
  Hash,
  Plus,
  ChevronDown,
  Eye,
  EyeOff,
  Send,
  MoreHorizontal,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { issuesKeys, meKeys, transitionsKeys, branchesForKeys } from "@/lib/query-keys";
import type { IssueItem } from "@/hooks/use-issues";
import type { QuickAction, QuickPanelDetail } from "./lib/board-types";
import { avatarClass, initials } from "./lib/board-utils";
import { CATEGORY_DOT_MAP } from "./lib/board-types";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium">{children}</dd>
    </div>
  );
}

export function QuickPanel({
  issue,
  jiraBaseUrl,
  assignees,
  onClose,
}: {
  issue: IssueItem;
  jiraBaseUrl: string;
  assignees: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [watched, setWatched] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [branchMsg, setBranchMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newLabelInput, setNewLabelInput] = useState("");
  const [showAddLabel, setShowAddLabel] = useState(false);
  const [newVersionInput, setNewVersionInput] = useState("");
  const [showAddVersion, setShowAddVersion] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const priorities = ["Blocker", "Highest", "High", "Medium", "Low", "Lowest"];

  const { data: me } = useQuery({
    queryKey: meKeys.status,
    queryFn: () => api<{ jiraName: string | null; jiraBaseUrl?: string; bitbucketBaseUrl?: string }>("/api/me/status"),
    staleTime: 60_000,
  });

  const { data: detail } = useQuery({
    queryKey: issuesKeys.detail(issue.jiraKey),
    queryFn: () => api<{ issue: QuickPanelDetail }>(`/api/issues/${issue.jiraKey}`),
    staleTime: 15_000,
    retry: 1,
  });

  const { data: transitions } = useQuery({
    queryKey: transitionsKeys.forIssue(issue.jiraKey),
    queryFn: () =>
      api<{ transitions: { id: string; to?: { name?: string } | string }[] }>(
        `/api/issues/${issue.jiraKey}/transitions`
      ),
    retry: 1,
  });

  const { data: branchesData, refetch: refetchBranches } = useQuery({
    queryKey: branchesForKeys.forIssue(issue.jiraKey),
    queryFn: () =>
      api<{ items: { repo: string; branch: string; prUrl?: string | null }[]; bitbucketBaseUrl?: string | null }>(
        `/api/issues/${issue.jiraKey}/branches`
      ),
    staleTime: 15_000,
  });

  const bitbucketBaseUrl = branchesData?.bitbucketBaseUrl || me?.bitbucketBaseUrl || "";
  const jiraUrl = getJiraIssueUrl(jiraBaseUrl || me?.jiraBaseUrl, issue.jiraKey);

  const { data: projectVersions } = useQuery({
    queryKey: issuesKeys.versions(issue.jiraKey),
    queryFn: () => api<{ items: { id: string; name: string }[] }>(`/api/issues/${issue.jiraKey}/versions`),
    staleTime: 60_000,
  });

  const d = detail?.issue;
  const summary = d?.summary || issue.summary || "(no summary)";
  const status = d?.status ?? issue.status;
  const statusCat = issue.statusCategory;
  const priority = d?.priority ?? issue.priority;
  const assigneeJira = d?.assigneeJira ?? issue.assigneeJira;
  const points = d?.points ?? issue.points;
  const type = d?.type ?? issue.type ?? "—";
  const updatedAt = d?.updatedAt ?? issue.updatedAt;
  const createdAt = d?.createdAt ?? issue.createdAt;
  const lastSyncedAt = d?.lastSyncedAt ?? issue.lastSyncedAt;
  const aiScore = d?.aiScore ?? issue.aiScore;
  const aiDecision = d?.aiDecision ?? issue.aiDecision;
  const description = d?.description ?? issue.description;
  const stale = d?.staleSnapshots?.[0] ?? null;

  function toName(t: { to?: { name?: string } | string }): string {
    return typeof t.to === "string" ? t.to : t.to?.name ?? "";
  }

  // Auto-focus the panel on open; trap Tab inside; Escape closes.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    const node = panelRef.current;
    node?.addEventListener("keydown", onKey);
    return () => {
      node?.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: issuesKeys.all });
    qc.invalidateQueries({ queryKey: issuesKeys.detail(issue.jiraKey) });
  }

  async function mutateField(patch: Record<string, unknown>) {
    try {
      await api(`/api/issues/${issue.jiraKey}`, { method: "PATCH", body: patch });
      await invalidate();
    } catch {
      // ignore
    }
  }

  async function handleCreateBranch() {
    setCreatingBranch(true);
    setBranchMsg(null);
    try {
      const res = await api<{ ok: boolean; branch?: string; error?: string }>(
        `/api/issues/${issue.jiraKey}/branches`,
        { method: "POST", body: {} }
      );
      await refetchBranches();
      setBranchMsg({ type: "success", text: `Đã tạo nhánh: ${res.branch}` });
      setTimeout(() => setBranchMsg(null), 4000);
    } catch (e) {
      setBranchMsg({ type: "error", text: `Lỗi: ${(e as Error).message}` });
      setTimeout(() => setBranchMsg(null), 4000);
    } finally {
      setCreatingBranch(false);
    }
  }

  async function handleAddLabel() {
    const val = newLabelInput.trim();
    if (!val) return;
    await mutateField({ addLabel: val });
    setNewLabelInput("");
    setShowAddLabel(false);
  }

  async function handleRemoveLabel(label: string) {
    await mutateField({ removeLabel: label });
  }

  async function handleAddVersion(verName: string) {
    const val = verName.trim();
    if (!val) return;
    await mutateField({ addFixVersion: val });
    setNewVersionInput("");
    setShowAddVersion(false);
  }

  async function handleRemoveVersion(verName: string) {
    await mutateField({ removeFixVersion: verName });
  }

  async function doAction(action: QuickAction) {
    const key = issue.jiraKey;
    try {
      if (action.kind === "openJira") {
        const base = jiraBaseUrl.replace(/\/$/, "");
        if (base) window.open(`${base}/browse/${key}`, "_blank", "noopener");
        return;
      }
      if (action.kind === "openFull") {
        router.push(`/issue/${key}`);
        return;
      }
      if (action.kind === "copyKey") {
        await navigator.clipboard.writeText(key);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
        return;
      }
      if (action.kind === "assignee") {
        await api(`/api/issues/${key}`, { method: "PATCH", body: { assignee: action.value } });
      } else if (action.kind === "priority") {
        await api(`/api/issues/${key}`, { method: "PATCH", body: { priority: action.value } });
      } else {
        const done = (transitions?.transitions ?? []).find(
          (t) => toName(t) && statusCatOf(t, issue)
        );
        if (done) await api(`/api/issues/${key}/transition`, { method: "POST", body: { transitionId: done.id } });
      }
      await invalidate();
    } catch {
      // Swallow; the board refetches on its own poll.
    }
  }

  function statusCatOf(t: { to?: { name?: string } | string }, i: IssueItem) {
    const n = toName(t).toLowerCase();
    return /done|resolved|closed|complete/.test(n) || i.statusCategory === "done";
  }

  async function toggleWatch() {
    try {
      await api(`/api/issues/${issue.jiraKey}/watch`, { method: "POST", body: {} });
      setWatched(true);
    } catch {
      // Ignore.
    }
  }

  async function addComment() {
    const text = commentDraft.trim();
    if (!text || commenting) return;
    setCommenting(true);
    try {
      await api(`/api/issues/${issue.jiraKey}/comments`, { method: "POST", body: { body: text } });
      setCommentDraft("");
      await invalidate();
    } catch {
      // Ignore.
    } finally {
      setCommenting(false);
    }
  }

  const dotClass = CATEGORY_DOT_MAP[statusCat] ?? "bg-slate-400";
  const commentCount = d?.comments?.length ?? 0;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`${issue.jiraKey} quick panel`}
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex h-full w-full max-w-md flex-col overflow-hidden border-l bg-card shadow-2xl outline-none motion-safe:animate-[panelIn_180ms_ease-out]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotClass)} aria-hidden />
          {jiraUrl ? (
            <a
              href={jiraUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
              title="Mở xem trên Jira"
            >
              <span>{issue.jiraKey}</span>
              <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
            </a>
          ) : (
            <span className="font-mono text-sm font-semibold text-primary">{issue.jiraKey}</span>
          )}
          <Badge variant="secondary" className="text-[11px]">{status}</Badge>
          {priority && (
            <Badge variant="outline" className="text-[11px]">{priority}</Badge>
          )}
          {points != null && (
            <Badge variant="outline" className="text-[11px]">{points}pt</Badge>
          )}
          {aiScore && (
            <Badge
              variant={aiDecision ? (aiDecision.decision === "rejected" ? "danger" : "success") : "info"}
              className="h-4 gap-1 px-1.5 text-[10px]"
              title={aiDecision ? `AI ${aiDecision.decision}` : "AI estimate (pending)"}
            >
              <Bot className="h-2.5 w-2.5" />
              {aiScore.points}pt
            </Badge>
          )}
          {stale && (
            <Badge variant="warning" className="h-4 gap-1 px-1.5 text-[10px]">
              <Clock className="h-2.5 w-2.5" /> {stale.stateAgeDays}d
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            {jiraUrl && (
              <a
                href={jiraUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground inline-flex items-center"
                title="Mở xem trên Jira"
                aria-label="Mở xem trên Jira"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              onClick={() => { navigator.clipboard.writeText(issue.jiraKey).catch(() => {}); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Copy key"
              title="Copy key"
            >
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 px-4 py-2">
          {/* Status Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-medium">
                <span className={cn("h-2 w-2 rounded-full", dotClass)} />
                <span className="truncate max-w-[110px]">{status}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel className="text-xs">Chuyển trạng thái</DropdownMenuLabel>
              {(transitions?.transitions ?? []).map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={async () => {
                    await api(`/api/issues/${issue.jiraKey}/transition`, {
                      method: "POST",
                      body: { transitionId: t.id },
                    });
                    await invalidate();
                  }}
                  className="gap-2 text-xs"
                >
                  <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
                  {toName(t)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assignee Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate max-w-[100px]">{assigneeJira || "Chưa gán"}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 max-h-64 overflow-y-auto">
              <DropdownMenuLabel className="text-xs">Gán người thực hiện</DropdownMenuLabel>
              {me?.jiraName && (
                <DropdownMenuItem
                  onClick={() => mutateField({ assignee: me.jiraName })}
                  className="gap-2 text-xs font-medium text-primary"
                >
                  <UserCheck className="h-3.5 w-3.5" /> Gán cho tôi ({me.jiraName})
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => mutateField({ assignee: null })}
                className="gap-2 text-xs text-muted-foreground"
              >
                <User className="h-3.5 w-3.5" /> Chưa gán (Unassigned)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {assignees.map((a) => (
                <DropdownMenuItem
                  key={a}
                  onClick={() => mutateField({ assignee: a })}
                  className="gap-2 text-xs"
                >
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{a}</span>
                  {a === assigneeJira && <span className="ml-auto text-primary">•</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Quick "Gán cho tôi" button */}
          {me?.jiraName && assigneeJira !== me.jiraName && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => mutateField({ assignee: me.jiraName })}
              className="h-7 gap-1 px-2 text-xs text-primary hover:bg-primary/10"
              title={`Gán nhanh cho tôi (${me.jiraName})`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Gán cho tôi
            </Button>
          )}

          {/* Story Points Picker */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                {points != null ? `${points} pt` : "— pt"}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuLabel className="text-xs">Đặt Story Points</DropdownMenuLabel>
              <div className="grid grid-cols-4 gap-1 p-1">
                {[1, 2, 3, 5, 8, 13, 21].map((p) => (
                  <Button
                    key={p}
                    variant={points === p ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-0 text-xs"
                    onClick={() => mutateField({ points: p })}
                  >
                    {p}
                  </Button>
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => mutateField({ points: null })}
                className="text-xs text-destructive"
              >
                Xóa điểm (None)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Priority Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                <Flag className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{priority || "Priority"}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              <DropdownMenuLabel className="text-xs">Độ ưu tiên</DropdownMenuLabel>
              {priorities.map((p) => (
                <DropdownMenuItem
                  key={p}
                  onClick={() => mutateField({ priority: p })}
                  className="gap-2 text-xs"
                >
                  <Flag className="h-3.5 w-3.5" /> {p}
                  {p === priority && <span className="ml-auto text-primary">•</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Create Branch Button */}
          <Button
            variant="outline"
            size="sm"
            disabled={creatingBranch}
            onClick={handleCreateBranch}
            className="h-7 gap-1.5 text-xs ml-auto"
            title="Tạo nhánh Bitbucket theo định dạng chuẩn"
          >
            {creatingBranch ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <GitBranch className="h-3.5 w-3.5 text-primary" />
            )}
            {creatingBranch ? "Đang tạo…" : "Tạo nhánh Git"}
          </Button>
        </div>

        {branchMsg && (
          <div
            className={cn(
              "px-4 py-1.5 text-xs font-medium",
              branchMsg.type === "success"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive"
            )}
          >
            {branchMsg.text}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <h2 className="text-base font-semibold leading-snug">{summary}</h2>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="Status">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1 hover:underline text-left">
                    <span className={cn("h-2 w-2 rounded-full inline-block mr-1", dotClass)} />
                    {status}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {(transitions?.transitions ?? []).map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      onClick={async () => {
                        await api(`/api/issues/${issue.jiraKey}/transition`, {
                          method: "POST",
                          body: { transitionId: t.id },
                        });
                        await invalidate();
                      }}
                      className="text-xs"
                    >
                      {toName(t)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </Field>

            <Field label="Priority">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1 hover:underline text-left">
                    {priority || "—"}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36">
                  {priorities.map((p) => (
                    <DropdownMenuItem key={p} onClick={() => mutateField({ priority: p })} className="text-xs">
                      {p}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </Field>

            <Field label="Assignee">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 hover:underline text-left">
                    {assigneeJira ? (
                      <>
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                            avatarClass(assigneeJira)
                          )}
                        >
                          {initials(assigneeJira)}
                        </span>
                        <span className="truncate">{assigneeJira}</span>
                      </>
                    ) : (
                      "Unassigned"
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52 max-h-64 overflow-y-auto">
                  {me?.jiraName && (
                    <DropdownMenuItem
                      onClick={() => mutateField({ assignee: me.jiraName })}
                      className="text-xs font-medium text-primary"
                    >
                      Gán cho tôi ({me.jiraName})
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => mutateField({ assignee: null })} className="text-xs">
                    Chưa gán
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {assignees.map((a) => (
                    <DropdownMenuItem key={a} onClick={() => mutateField({ assignee: a })} className="text-xs">
                      {a}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </Field>

            <Field label="Points">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="hover:underline text-left">
                    {points != null ? `${points} pt` : "—"}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36">
                  <div className="grid grid-cols-4 gap-1 p-1">
                    {[1, 2, 3, 5, 8, 13, 21].map((p) => (
                      <Button
                        key={p}
                        variant={points === p ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-0 text-xs"
                        onClick={() => mutateField({ points: p })}
                      >
                        {p}
                      </Button>
                    ))}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => mutateField({ points: null })} className="text-xs text-destructive">
                    Xóa điểm
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Field>

            <Field label="Type">{type}</Field>
            <Field label="Updated">{timeAgo(updatedAt)}</Field>
            <Field label="Created">{formatDateTime(createdAt)}</Field>
            <Field label="Last synced">{timeAgo(lastSyncedAt)}</Field>
          </div>

          {/* Fix Versions */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                Phiên bản phát hành (Fix Versions)
              </span>
              {!showAddVersion && (
                <button
                  onClick={() => setShowAddVersion(true)}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" /> Thêm version
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(d?.fixVersions ?? issue.fixVersionNames ?? []).length === 0 && !showAddVersion && (
                <span className="text-xs italic text-muted-foreground">Chưa gắn phiên bản</span>
              )}
              {(d?.fixVersions ?? issue.fixVersionNames ?? []).map((v) => (
                <Badge key={v} variant="info" className="gap-1 text-[11px]">
                  {v}
                  <button
                    onClick={() => handleRemoveVersion(v)}
                    className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                    title={`Gỡ ${v}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {showAddVersion && (
                <div className="flex items-center gap-1.5">
                  {projectVersions?.items && projectVersions.items.length > 0 ? (
                    <Select onValueChange={(val) => handleAddVersion(val)}>
                      <SelectTrigger className="h-6 w-32 text-xs">
                        <SelectValue placeholder="Chọn version…" />
                      </SelectTrigger>
                      <SelectContent>
                        {projectVersions.items.map((pv) => (
                          <SelectItem key={pv.id} value={pv.name} className="text-xs">
                            {pv.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      autoFocus
                      value={newVersionInput}
                      onChange={(e) => setNewVersionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddVersion(newVersionInput);
                        if (e.key === "Escape") setShowAddVersion(false);
                      }}
                      placeholder="1.0.0"
                      className="h-6 w-24 text-xs px-1.5"
                    />
                  )}
                  {!projectVersions?.items?.length && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      onClick={() => handleAddVersion(newVersionInput)}
                    >
                      Lưu
                    </Button>
                  )}
                  <button
                    onClick={() => setShowAddVersion(false)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Labels */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                Nhãn (Labels)
              </span>
              {!showAddLabel && (
                <button
                  onClick={() => setShowAddLabel(true)}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" /> Thêm nhãn
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(d?.labels ?? issue.labels ?? []).length === 0 && !showAddLabel && (
                <span className="text-xs italic text-muted-foreground">Không có nhãn</span>
              )}
              {(d?.labels ?? issue.labels ?? []).map((l) => (
                <Badge key={l} variant="outline" className="gap-1 text-[11px]">
                  {l}
                  <button
                    onClick={() => handleRemoveLabel(l)}
                    className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                    title={`Xóa nhãn ${l}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {showAddLabel && (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={newLabelInput}
                    onChange={(e) => setNewLabelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddLabel();
                      if (e.key === "Escape") setShowAddLabel(false);
                    }}
                    placeholder="Tên nhãn…"
                    className="h-6 w-28 text-xs px-1.5"
                  />
                  <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleAddLabel}>
                    Lưu
                  </Button>
                  <button
                    onClick={() => setShowAddLabel(false)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Linked Branches */}
          {(branchesData?.items ?? []).length > 0 && (
            <div className="mt-4">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold block mb-1.5">
                Nhánh Bitbucket liên kết
              </span>
              <div className="flex flex-col gap-1.5">
                {branchesData!.items.map((b) => {
                  const branchUrl = getBitbucketBranchUrl(b.repo, b.branch, bitbucketBaseUrl, b.prUrl);
                  return (
                    <div
                      key={`${b.repo}-${b.branch}`}
                      className="flex items-center justify-between rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs font-mono"
                    >
                      <div className="flex items-center gap-2 truncate min-w-0">
                        <GitBranch className="h-3.5 w-3.5 text-primary shrink-0" />
                        {branchUrl ? (
                          <a
                            href={branchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                            title={`Xem nhánh ${b.branch} trên Git`}
                          >
                            <span className="truncate">{b.branch}</span>
                            <ExternalLink className="h-3 w-3 opacity-60 shrink-0" aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="truncate">{b.branch}</span>
                        )}
                      </div>
                      {b.prUrl && (
                        <a
                          href={b.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1 shrink-0 ml-2 font-sans font-medium"
                          title="Xem Pull Request trên Git"
                        >
                          PR <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Section title="Description">
            {description ? (
              <div
                className="wiki-content text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: wikiToHtml(description) }}
              />
            ) : (
              <p className="text-sm italic text-muted-foreground">No description.</p>
            )}
          </Section>

          <Section title={`Comments (${commentCount})`}>
            <div className="flex gap-2">
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void addComment();
                }}
                placeholder="Thêm bình luận lên Jira…"
                rows={2}
                className="min-h-[3rem] flex-1 resize-y rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={commenting || !commentDraft.trim()}
                onClick={() => void addComment()}
                className="h-8 shrink-0 gap-1.5"
              >
                <Send className="h-3.5 w-3.5" /> {commenting ? "…" : "Gửi"}
              </Button>
            </div>
            {(d?.comments ?? []).length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {(d?.comments ?? [])
                  .slice(-3)
                  .map((c) => (
                    <div key={c.id} className="rounded-md border bg-muted/30 p-2.5">
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <span className="font-medium">{c.author}</span>
                        <span className="text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                      </div>
                      <div
                        className="wiki-content text-sm"
                        dangerouslySetInnerHTML={{ __html: wikiToHtml(c.body) }}
                      />
                    </div>
                  ))}
              </div>
            )}
          </Section>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2 border-t px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => (watched ? setWatched(false) : void toggleWatch())}
            className="gap-1.5"
            title={watched ? "Stop watching" : "Watch"}
          >
            {watched ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {watched ? "Watching" : "Watch"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const base = (jiraBaseUrl || me?.jiraBaseUrl || "").replace(/\/$/, "");
              if (base) window.open(`${base}/browse/${issue.jiraKey}`, "_blank", "noopener");
            }}
            className="gap-1.5 cursor-pointer text-xs"
            title="Mở xem trên Jira"
          >
            <ExternalLink className="h-4 w-4" /> Xem trên Jira
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <MoreHorizontal className="h-4 w-4" /> More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Assign to</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); void doAction({ kind: "assignee", value: null }); }}
                className="gap-2"
              >
                <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Unassigned
              </DropdownMenuItem>
              {assignees.slice(0, 12).map((a) => (
                <DropdownMenuItem
                  key={a}
                  onSelect={(e) => { e.preventDefault(); void doAction({ kind: "assignee", value: a }); }}
                  className="gap-2"
                >
                  <User className="h-3.5 w-3.5" aria-hidden />
                  <span className="truncate">{a}</span>
                  {a === assigneeJira && <span className="ml-auto text-primary">•</span>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Priority</DropdownMenuLabel>
              {priorities.map((p) => (
                <DropdownMenuItem
                  key={p}
                  onSelect={(e) => { e.preventDefault(); void doAction({ kind: "priority", value: p }); }}
                  className="gap-2"
                >
                  <Flag className="h-3.5 w-3.5" aria-hidden /> {p}
                  {p === priority && <span className="ml-auto text-primary">•</span>}
                </DropdownMenuItem>
              ))}
              {transitions && transitions.transitions.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Move to…</DropdownMenuLabel>
                  {transitions.transitions.map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      onSelect={(e) => {
                        e.preventDefault();
                        void (async () => {
                          try {
                            await api(`/api/issues/${issue.jiraKey}/transition`, {
                              method: "POST",
                              body: { transitionId: t.id },
                            });
                            await invalidate();
                          } catch {
                            // ignore
                          }
                        })();
                      }}
                      className="gap-2"
                    >
                      <CornerDownLeft className="h-3.5 w-3.5" aria-hidden /> {toName(t)}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => router.push(`/issue/${issue.jiraKey}`)}
            title="Open full detail"
          >
            <CornerDownLeft className="h-4 w-4" /> Full detail
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
