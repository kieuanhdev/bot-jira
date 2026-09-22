"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { wikiToHtml } from "@/lib/wiki";
import { Bot, Check, Eye, EyeOff, RefreshCw, GitBranch, Send, X, Pencil, AlertTriangle, Info } from "lucide-react";

type IssueDetail = {
  jiraKey: string;
  summary: string;
  description: string;
  status: string;
  assigneeJira: string | null;
  labels: string[];
  priority: string;
  points: number | null;
  type: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastSyncedAt: string;
  aiScore: {
    points: number;
    confidence: number | null;
    reasoning: string;
    risks: string[];
    missingInformation: string[];
    similarTasks: string[];
    model: string;
    promptVersion: string | null;
    scoredAt: string;
  } | null;
  aiDecision: { decision: string; finalPoints: number | null; decidedAt: string } | null;
  comments: { id: string; author: string; body: string; createdAt: string | null }[];
  releaseTasks: { release: { version: string; status: string } }[];
  staleSnapshots: {
    ageDays: number;
    detectedAt: string;
    staleReason: string;
    severity: string;
    stateAgeDays: number;
    blockedDays: number;
  }[];
};

type Transition = { id: string; name: string; to?: { name?: string } | string };

function transitionTo(t: Transition): string {
  return typeof t.to === "string" ? t.to : t.to?.name ?? t.name ?? "";
}
type BranchRow = { repo: string; branch: string; merged: boolean; lastCommitAt: string | null };

export function IssueDetailClient({ issue: initial }: { issue: IssueDetail }) {
  const [issue, setIssue] = useState<IssueDetail>(initial);
  const [watched, setWatched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editPoints, setEditPoints] = useState("");

  const { data: transitions } = useQuery({
    queryKey: ["transitions", issue.jiraKey],
    queryFn: () => api<{ transitions: Transition[] }>(`/api/issues/${issue.jiraKey}/transitions`),
    retry: 1,
  });

  const { data: branches } = useQuery({
    queryKey: ["branches-for", issue.jiraKey],
    queryFn: () =>
      api<{ items: BranchRow[] }>(`/api/issues/${issue.jiraKey}/branches`),
    retry: 1,
  });

  async function doAction(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(message);
      // Refresh the issue from the cache after the mutation invalidated it.
      const fresh = await api<{ issue: IssueDetail }>(`/api/issues/${issue.jiraKey}`);
      setIssue(fresh.issue);
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onTransition(t: Transition) {
    await doAction(
      () =>
        api(`/api/issues/${issue.jiraKey}/transition`, {
          method: "POST",
          body: { transitionId: t.id },
        }),
      `Transitioned to ${transitionTo(t)}`
    );
  }

  async function onToggleWatch() {
    await doAction(
      () => api(`/api/issues/${issue.jiraKey}/watch`, { method: "POST", body: {} }),
      watched ? "Unwatched" : "Watching"
    );
    setWatched((w) => !w);
  }

  async function onAiScore() {
    setBusy(true);
    setMsg("AI scoring…");
    try {
      await api(`/api/issues/${issue.jiraKey}/ai-score`, { method: "POST", body: {} });
      const fresh = await api<{ issue: IssueDetail }>(`/api/issues/${issue.jiraKey}`);
      setIssue(fresh.issue);
      setMsg("AI score ready");
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onAiDecision(decision: "accepted" | "edited" | "rejected", points?: number) {
    if (!issue.aiScore) return;
    const done =
      decision === "accepted"
        ? `Accepted AI points (${issue.aiScore.points}) → Jira`
        : decision === "edited"
          ? `Set points to ${points} → Jira`
          : "Rejected AI estimate (Jira unchanged)";
    await doAction(
      () =>
        api(`/api/issues/${issue.jiraKey}/ai-score/decision`, {
          method: "POST",
          body: { decision, points },
        }),
      done
    );
    if (decision !== "rejected") {
      setEditMode(false);
      setEditPoints("");
    }
  }

  function startEdit() {
    if (!issue.aiScore) return;
    setEditPoints(String(issue.points ?? issue.aiScore.points ?? ""));
    setEditMode(true);
  }

  async function onAddComment() {
    const text = commentDraft.trim();
    if (!text) return;
    setCommenting(true);
    setMsg(null);
    try {
      await api(`/api/issues/${issue.jiraKey}/comments`, {
        method: "POST",
        body: { body: text },
      });
      setCommentDraft("");
      setMsg("Comment posted to Jira");
      const fresh = await api<{ issue: IssueDetail }>(`/api/issues/${issue.jiraKey}`);
      setIssue(fresh.issue);
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setCommenting(false);
    }
  }

  const stale = issue.staleSnapshots[0];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{issue.jiraKey}</span>
            <Badge>{issue.status}</Badge>
            {issue.points != null && <Badge variant="secondary">{issue.points}pt</Badge>}
            {stale && (
              <Badge variant={stale.severity === "high" ? "danger" : stale.severity === "info" ? "info" : "warning"}>
                {stale.staleReason.replace(/_/g, " ")} · {stale.stateAgeDays}d
              </Badge>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{issue.summary}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{issue.type}</span>
            {issue.priority && <span>· {issue.priority}</span>}
            {issue.assigneeJira && <span>· {issue.assigneeJira}</span>}
            <span>· updated {timeAgo(issue.updatedAt)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onToggleWatch}
            className="gap-1.5"
          >
            {watched ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {watched ? "Watching" : "Watch"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default" size="sm" disabled={busy || !transitions?.transitions?.length}>
                <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                Move to…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              <DropdownMenuLabel>Transition</DropdownMenuLabel>
              {transitions?.transitions?.map((t) => (
                <DropdownMenuItem key={t.id} disabled={busy} onClick={() => onTransition(t)}>
                  {transitionTo(t)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {issue.releaseTasks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {issue.releaseTasks.map((rt, i) => (
            <Badge key={i} variant="info">
              release {rt.release.version} ({rt.release.status})
            </Badge>
          ))}
        </div>
      )}

      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {issue.labels.map((l) => (
            <Badge key={l} variant="outline">{l}</Badge>
          ))}
        </div>
      )}

      {msg && (
        <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">{msg}</div>
      )}

      <Tabs defaultValue="detail">
        <TabsList>
          <TabsTrigger value="detail">Detail</TabsTrigger>
          <TabsTrigger value="comments">Comments ({issue.comments.length})</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
        </TabsList>

        <TabsContent value="detail">
          <Card>
            <CardHeader><CardTitle>Description</CardTitle></CardHeader>
            <CardContent>
              {issue.description ? (
                <div
                  className="wiki-content text-sm"
                  dangerouslySetInnerHTML={{ __html: wikiToHtml(issue.description) }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
              <Separator className="my-4" />
              <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
                <div><span className="font-medium">Created:</span> {formatDateTime(issue.createdAt)}</div>
                <div><span className="font-medium">Updated:</span> {formatDateTime(issue.updatedAt)}</div>
                <div><span className="font-medium">Last synced:</span> {timeAgo(issue.lastSyncedAt)}</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comments">
          <div className="flex flex-col gap-3">
            <Card>
              <CardContent className="p-4">
                <Textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Add a comment to Jira…"
                  rows={3}
                  className="resize-y"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    disabled={commenting || !commentDraft.trim()}
                    onClick={onAddComment}
                    className="gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {commenting ? "Posting…" : "Comment"}
                  </Button>
                </div>
              </CardContent>
            </Card>
            {issue.comments.length === 0 && (
              <Card><CardContent className="text-sm text-muted-foreground">No comments yet.</CardContent></Card>
            )}
            {issue.comments.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="mb-1 flex items-center gap-2 text-sm">
                    <span className="font-medium">{c.author}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                  </div>
                    <div
                      className="wiki-content text-sm"
                      dangerouslySetInnerHTML={{ __html: wikiToHtml(c.body) }}
                    />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-4 w-4" /> AI task point
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!issue.aiScore ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">No AI score yet.</p>
                  <Button onClick={onAiScore} disabled={busy}>
                    <Bot className="h-4 w-4" /> Score this task
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-lg bg-primary/10 px-4 py-2 text-2xl font-bold text-primary">
                      {issue.aiScore.points} pt
                    </div>
                    {issue.aiScore.confidence != null && (
                      <Badge variant={issue.aiScore.confidence >= 0.7 ? "success" : issue.aiScore.confidence >= 0.4 ? "warning" : "danger"}>
                        {(issue.aiScore.confidence * 100).toFixed(0)}% confidence
                      </Badge>
                    )}
                    <div className="text-xs text-muted-foreground">{issue.aiScore.model}</div>
                  </div>
                  <p className="text-sm">{issue.aiScore.reasoning}</p>

                  {issue.aiScore.missingInformation?.length > 0 && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" /> Missing information
                      </p>
                      <ul className="list-inside list-disc text-sm">
                        {issue.aiScore.missingInformation.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}

                  {issue.aiScore.risks?.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Risks</p>
                      <ul className="list-inside list-disc text-sm">
                        {issue.aiScore.risks.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}

                  {issue.aiScore.similarTasks?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Similar tasks:</span>
                      {issue.aiScore.similarTasks.map((k, i) => (
                        <Badge key={i} variant="outline">{k}</Badge>
                      ))}
                    </div>
                  )}

                  {issue.aiDecision && (
                    <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      {issue.aiDecision.decision === "accepted" && "AI estimate accepted."}
                      {issue.aiDecision.decision === "edited" && `Edited to ${issue.aiDecision.finalPoints}pt and applied.`}
                      {issue.aiDecision.decision === "rejected" && "AI estimate rejected (Jira unchanged)."}
                    </div>
                  )}

                  {editMode ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-sm text-muted-foreground">Points</label>
                      <Input
                        type="number"
                        min={1}
                        value={editPoints}
                        onChange={(e) => setEditPoints(e.target.value)}
                        className="w-24"
                      />
                      <Button size="sm" disabled={busy} onClick={() => onAiDecision("edited", Number(editPoints))}>
                        <Check className="h-4 w-4" /> Apply {editPoints || "?"}pt → Jira
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditMode(false)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={onAiScore} disabled={busy}>
                        <RefreshCw className="h-4 w-4" /> Re-score
                      </Button>
                      <Button variant="outline" onClick={() => onAiDecision("accepted")} disabled={busy}>
                        <Check className="h-4 w-4" /> Accept {issue.aiScore.points}pt → Jira
                      </Button>
                      <Button variant="outline" onClick={startEdit} disabled={busy}>
                        <Pencil className="h-4 w-4" /> Edit points
                      </Button>
                      <Button variant="outline" onClick={() => onAiDecision("rejected")} disabled={busy}>
                        <X className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branches">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><GitBranch className="h-4 w-4" /> Related branches</CardTitle></CardHeader>
            <CardContent>
              {branches?.items?.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-1.5">Branch</th>
                      <th>Repo</th>
                      <th>Merged</th>
                      <th>Last commit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branches.items.map((b, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5 font-mono text-xs">{b.branch}</td>
                        <td className="text-xs">{b.repo}</td>
                        <td>{b.merged ? <Badge variant="success">merged</Badge> : <Badge variant="danger">open</Badge>}</td>
                        <td className="text-xs text-muted-foreground">{timeAgo(b.lastCommitAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No branches linked. Add a <code className="rounded bg-muted px-1 text-xs">branch:&lt;name&gt;</code> label to link a branch.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
