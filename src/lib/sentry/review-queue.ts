import { prisma } from "@/lib/prisma";
import { env, jiraProjectList, parseSentryMappings, resolveJiraProject } from "@/lib/env";
import { sentryIdKey, sentryProjectSlug } from "./idempotency";

// Sentry review queue: every new Sentry issue is recorded once in
// SentryIssueImported. With approval on (default) it lands in `review` and an
// admin decides; with approval off it goes straight to `approved`. Only
// `approved` (and `failed` past backoff) rows are filed into Jira by the
// sentry-import worker.

export type SentryIssueLike = {
  id?: number | string;
  shortId?: string;
  title?: string;
  permalinkUrl?: string;
  level?: string;
  count?: number | string;
  culprit?: string;
  userCount?: number | string;
  firstSeen?: string;
  lastSeen?: string;
  project?: { slug?: string };
};

const mappings = parseSentryMappings(env.sentryProjectMappings);
const fallbackProject = jiraProjectList[0] ?? null;

function toDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toCount(value: number | string | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.trunc(n), 2_147_483_647) : null;
}

/** Fields refreshed on every sighting; never touches state or the decision. */
export function sentrySnapshot(issue: SentryIssueLike) {
  return {
    ...(issue.shortId ? { shortId: issue.shortId } : {}),
    ...(issue.title ? { title: issue.title.slice(0, 500) } : {}),
    ...(issue.level ? { level: issue.level.toLowerCase() } : {}),
    ...(issue.permalinkUrl ? { permalinkUrl: issue.permalinkUrl } : {}),
    ...(toCount(issue.count) !== null ? { eventCount: toCount(issue.count) } : {}),
    ...(issue.culprit ? { culprit: issue.culprit.slice(0, 300) } : {}),
    ...(toCount(issue.userCount) !== null ? { userCount: toCount(issue.userCount) } : {}),
    ...(toDate(issue.firstSeen) ? { firstSeen: toDate(issue.firstSeen) } : {}),
    ...(toDate(issue.lastSeen) ? { lastSeen: toDate(issue.lastSeen) } : {}),
  };
}

/**
 * Record a Sentry issue in the review queue. A new row starts in `review`
 * (or `approved` when approval is off), or `ignored` when its Sentry project
 * has no Jira mapping. An existing row only gets its snapshot refreshed, so a
 * human decision is never overwritten.
 */
export async function seedSentryIssue(
  issue: SentryIssueLike,
  /** Per-user polling: the polled slug and the user's own Jira target. */
  override?: { projectSlug: string; targetProject: string },
  now: Date = new Date()
): Promise<void> {
  const sentryIssueId = sentryIdKey(issue);
  if (!sentryIssueId) return;
  const sentryProject = override?.projectSlug ?? sentryProjectSlug(issue, env.sentryProject);
  const targetProject =
    override?.targetProject ?? resolveJiraProject(sentryProject, mappings, fallbackProject);
  const snapshot = sentrySnapshot(issue);

  const existing = await prisma.sentryIssueImported.findUnique({
    where: { sentryProject_sentryIssueId: { sentryProject, sentryIssueId } },
    select: { eventCount: true, countBaseline: true, countBaselineAt: true },
  });

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  let baselineUpdates: { countBaseline?: number; countBaselineAt?: Date } = {};

  if (!existing) {
    baselineUpdates = {
      countBaseline: 0,
      countBaselineAt: now,
    };
  } else {
    const isBaselineOlderThan24h =
      existing.countBaselineAt === null ||
      now.getTime() - existing.countBaselineAt.getTime() >= TWENTY_FOUR_HOURS_MS;

    if (isBaselineOlderThan24h) {
      baselineUpdates = {
        countBaseline: existing.eventCount ?? 0,
        countBaselineAt: now,
      };
    }
  }

  await prisma.sentryIssueImported.upsert({
    where: { sentryProject_sentryIssueId: { sentryProject, sentryIssueId } },
    create: {
      sentryProject,
      sentryIssueId,
      ...snapshot,
      ...baselineUpdates,
      targetProject,
      state: !targetProject ? "ignored" : env.sentryImportRequireApproval ? "review" : "approved",
      lastError: targetProject ? null : `no Jira project mapping for Sentry project "${sentryProject}"`,
    },
    update: {
      ...snapshot,
      ...baselineUpdates,
    },
  });
}
