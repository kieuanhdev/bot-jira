import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { bitbucket, isBitbucketPermissionError, type BbCreds } from "./client";
import { appendJiraKey } from "./pr-jira-sync";

/**
 * Bulk pull-request creation for one Jira task. A task usually owns one branch
 * per repo (submodule-style projects), so the plan is built from the task's
 * confirmed branch links and executed repo by repo. Each repo succeeds or fails
 * on its own — one broken repo never blocks the others.
 */

export type PrPlanStatus =
  | "ready"
  | "has_open_pr"
  | "merged"
  | "same_as_target";

export type PrPlanItem = {
  branchId: string;
  repo: string;
  branch: string;
  /** Branch the PR will merge into. */
  target: string;
  /** Branches of the repo the PR can target (known branches + default). */
  targetOptions: string[];
  status: PrPlanStatus;
  prId?: number | null;
  prUrl?: string | null;
};

export type PrPlan = {
  jiraKey: string;
  summary: string;
  items: PrPlanItem[];
};

export type PrCreateStatus =
  | "created"
  | "skipped_open_pr"
  | "skipped_merged"
  | "skipped_same_target"
  | "no_changes"
  | "forbidden"
  | "error";

export type PrCreateResult = {
  branchId: string;
  repo: string;
  branch: string;
  target: string;
  status: PrCreateStatus;
  prId?: number;
  prUrl?: string;
  message?: string;
};

export function prTitleFor(jiraKey: string, summary: string): string {
  const title = summary.trim() ? `${jiraKey}: ${summary.trim()}` : jiraKey;
  return title.length > 200 ? `${title.slice(0, 197)}...` : title;
}

async function loadTask(jiraKey: string) {
  return prisma.issueCache.findUnique({
    where: { jiraKey },
    select: {
      jiraKey: true,
      summary: true,
      branchLinks: {
        where: { linkState: "confirmed", branch: { deletedAt: null } },
        select: { branch: true },
        orderBy: { branch: { repo: "asc" } },
      },
    },
  });
}

/** Repo default branch, falling back to BITBUCKET_BASE_BRANCH. Cached per call. */
async function resolveDefaults(repos: string[], creds: BbCreds): Promise<Map<string, string>> {
  const unique = [...new Set(repos)];
  const entries = await Promise.all(
    unique.map(async (repo) => {
      const def = await bitbucket.getDefaultBranch(repo, creds);
      return [repo, def ?? env.bitbucketBaseBranch] as const;
    })
  );
  return new Map(entries);
}

/** Dry run: which branches of the task would get a PR, and into what. */
export async function planTaskPullRequests(
  jiraKey: string,
  creds: BbCreds,
  opts: { branchIds?: string[]; targets?: Record<string, string> } = {}
): Promise<PrPlan | null> {
  const task = await loadTask(jiraKey);
  if (!task) return null;

  const wanted = opts.branchIds ? new Set(opts.branchIds) : null;
  const branches = task.branchLinks
    .map((l) => l.branch)
    .filter((b) => !wanted || wanted.has(b.id));
  const defaults = await resolveDefaults(
    branches.map((b) => b.repo),
    creds
  );

  const known = await prisma.branchInfo.findMany({
    where: { repo: { in: [...defaults.keys()] }, deletedAt: null },
    select: { repo: true, branch: true },
    orderBy: { branch: "asc" },
  });
  const byRepo = new Map<string, string[]>();
  for (const k of known) byRepo.set(k.repo, [...(byRepo.get(k.repo) ?? []), k.branch]);

  const items: PrPlanItem[] = branches.map((b) => {
    const target = opts.targets?.[b.id]?.trim() || defaults.get(b.repo) || env.bitbucketBaseBranch;
    const def = defaults.get(b.repo) ?? env.bitbucketBaseBranch;
    const targetOptions = [...new Set([def, target, ...(byRepo.get(b.repo) ?? [])])].filter(
      (name) => name !== b.branch
    );
    let status: PrPlanStatus = "ready";
    if (b.branch === target) status = "same_as_target";
    else if (b.prState?.toUpperCase() === "OPEN") status = "has_open_pr";
    else if (b.merged) status = "merged";
    return {
      branchId: b.id,
      repo: b.repo,
      branch: b.branch,
      target,
      targetOptions,
      status,
      prId: b.prId,
      prUrl: b.prUrl,
    };
  });

  return { jiraKey: task.jiraKey, summary: task.summary, items };
}

function describeError(e: unknown): { status: PrCreateStatus; message: string } {
  const msg = e instanceof Error ? e.message : String(e);
  if (isBitbucketPermissionError(e)) {
    return { status: "forbidden", message: "Không có quyền tạo PR ở repo này" };
  }
  // Bitbucket DC answers 409 when source and target have no diff.
  if (/-> 409/.test(msg) && /no commits|already up.to.date|nothing to merge/i.test(msg)) {
    return { status: "no_changes", message: "Nhánh không có commit mới so với nhánh đích" };
  }
  if (/-> 409/.test(msg) && /already (exists|open)|duplicate/i.test(msg)) {
    return { status: "skipped_open_pr", message: "Đã có PR đang mở cho nhánh này" };
  }
  return { status: "error", message: msg.slice(0, 300) };
}

/** Create one PR per ready branch; returns a result per planned branch. */
export async function createTaskPullRequests(
  jiraKey: string,
  creds: BbCreds,
  actor: { id: string; email?: string },
  opts: { branchIds?: string[]; targets?: Record<string, string>; reviewers?: string[] } = {}
): Promise<{ summary: string; results: PrCreateResult[] } | null> {
  const plan = await planTaskPullRequests(jiraKey, creds, opts);
  if (!plan) return null;

  const title = prTitleFor(plan.jiraKey, plan.summary);
  const description = appendJiraKey(undefined, plan.jiraKey);
  const results: PrCreateResult[] = [];

  for (const item of plan.items) {
    const base = {
      branchId: item.branchId,
      repo: item.repo,
      branch: item.branch,
      target: item.target,
    };
    if (item.status !== "ready") {
      const skip: Record<Exclude<PrPlanStatus, "ready">, PrCreateStatus> = {
        has_open_pr: "skipped_open_pr",
        merged: "skipped_merged",
        same_as_target: "skipped_same_target",
      };
      results.push({
        ...base,
        status: skip[item.status],
        prId: item.prId ?? undefined,
        prUrl: item.prUrl ?? undefined,
      });
      continue;
    }

    try {
      const pr = await bitbucket.createPullRequest(
        item.repo,
        {
          title,
          description,
          from: item.branch,
          to: item.target,
          reviewers: opts.reviewers,
        },
        creds
      );
      await prisma.branchInfo.update({
        where: { id: item.branchId },
        data: {
          prId: pr.id,
          prTitle: pr.title ?? title,
          prUrl: pr.url ?? null,
          prState: "OPEN",
          prDestinationBranch: item.target,
          prUpdatedAt: new Date(),
        },
      });
      await audit({
        actorId: actor.id,
        actorEmail: actor.email,
        action: "branch.pr_create",
        source: "web",
        target: `${item.repo}:${item.branch}`,
        after: { prId: pr.id, jiraKey: plan.jiraKey, to: item.target },
      });
      results.push({ ...base, status: "created", prId: pr.id, prUrl: pr.url });
    } catch (e) {
      const { status, message } = describeError(e);
      results.push({ ...base, status, message });
    }
  }

  return { summary: summarizePrCreate(results), results };
}

/** One-line Vietnamese summary for the UI toast. */
export function summarizePrCreate(results: PrCreateResult[]): string {
  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status.startsWith("skipped") || r.status === "no_changes").length;
  const failed = results.filter((r) => r.status === "forbidden" || r.status === "error").length;
  const parts: string[] = [];
  if (created > 0) parts.push(`đã tạo ${created} PR`);
  if (skipped > 0) parts.push(`bỏ qua ${skipped}`);
  if (failed > 0) parts.push(`lỗi ${failed}`);
  return parts.join(", ") || "không có PR nào cần tạo";
}
