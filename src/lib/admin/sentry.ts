import type { ImportState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getJiraIssueUrl } from "@/lib/jira/urls";

const STATES: ImportState[] = ["review", "pending", "approved", "created", "rejected", "failed", "ignored"];

export async function listSentryImports(stateParam?: string) {
  const requested = (stateParam ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ImportState => (STATES as string[]).includes(s));
  if (requested.includes("review")) requested.push("pending");

  const [items, grouped] = await Promise.all([
    prisma.sentryIssueImported.findMany({
      where: requested.length ? { state: { in: requested } } : undefined,
      orderBy: [{ lastSeen: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.sentryIssueImported.groupBy({ by: ["state"], _count: { _all: true } }),
  ]);

  const counts: Record<string, number> = {};
  for (const g of grouped) {
    const key = g.state === "pending" ? "review" : g.state;
    counts[key] = (counts[key] ?? 0) + g._count._all;
  }

  const result = {
    counts,
    requireApproval: env.sentryImportRequireApproval,
    items: items.map((r) => ({
      id: r.id,
      sentryProject: r.sentryProject,
      sentryIssueId: r.sentryIssueId,
      shortId: r.shortId,
      title: r.title,
      level: r.level,
      permalinkUrl: r.permalinkUrl,
      eventCount: r.eventCount,
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      targetProject: r.targetProject,
      draftSummary: r.draftSummary,
      draftDescription: r.draftDescription,
      jiraKey: r.jiraKey,
      jiraUrl: getJiraIssueUrl(env.jiraBaseUrl, r.jiraKey),
      state: r.state === "pending" ? "review" : r.state,
      attemptCount: r.attemptCount,
      lastError: r.lastError,
      lastAttemptAt: r.lastAttemptAt,
      importedAt: r.importedAt,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    })),
  };

  return JSON.parse(JSON.stringify(result));
}
