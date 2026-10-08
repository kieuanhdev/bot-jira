import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { bitbucket, isBitbucketPermissionError, type BbCreds } from "./client";

/**
 * Jira (Server/DC) links a pull request — with its source branch and commits —
 * to a task when the task key appears in the PR. Jira has no API to push that
 * link, so after a manual branch→task link we put the key into the PR's
 * description. This is best-effort and must never fail the link itself.
 */

export type PrSyncStatus =
  | "updated"
  | "already_present"
  | "no_pr"
  | "pr_closed"
  | "pr_not_found"
  | "no_credentials"
  | "forbidden"
  | "error";

export type PrSyncResult = {
  branchId: string;
  branch: string;
  status: PrSyncStatus;
};

function mentionsKey(text: string | undefined | null, jiraKey: string): boolean {
  if (!text) return false;
  return new RegExp(`(^|[^A-Za-z0-9])${jiraKey}(?![0-9])`, "i").test(text);
}

export function appendJiraKey(description: string | undefined, jiraKey: string): string {
  const base = (description ?? "").trimEnd();
  return base ? `${base}\n\nJira: ${jiraKey}` : `Jira: ${jiraKey}`;
}

export async function syncPullRequestJiraKey(
  branchId: string,
  jiraKey: string,
  creds: BbCreds | null,
  actor: { id: string; email?: string }
): Promise<PrSyncResult> {
  const branch = await prisma.branchInfo.findUnique({
    where: { id: branchId },
    select: { repo: true, branch: true, prId: true, prState: true },
  });
  const name = branch?.branch ?? "";
  const done = (status: PrSyncStatus): PrSyncResult => ({ branchId, branch: name, status });

  if (!branch) return done("no_pr");
  if (!creds) return done("no_credentials");

  try {
    // The cached PR can lag behind Bitbucket (the branch scan runs every few
    // minutes), so look the PR up live instead of trusting prId/prState.
    let prId = branch.prId;
    if (!prId) {
      const open = await bitbucket.listOpenPullRequests(branch.repo, creds);
      const found = open.find((p) => p.fromRef.branch === branch.branch);
      if (!found) return done("no_pr");
      prId = found.id;
      await prisma.branchInfo.update({
        where: { id: branchId },
        data: {
          prId: found.id,
          prTitle: found.title ?? null,
          prUrl: found.url ?? null,
          prState: "OPEN",
          prDestinationBranch: found.toRef?.branch ?? null,
        },
      });
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const pr = await bitbucket.getPullRequest(branch.repo, prId, creds);
      if (!pr) return done("pr_not_found");
      if (pr.state && pr.state.toUpperCase() !== "OPEN") return done("pr_closed");
      if (mentionsKey(pr.title, jiraKey) || mentionsKey(pr.description, jiraKey)) {
        return done("already_present");
      }
      if (pr.version === undefined || !pr.title) return done("error");

      try {
        await bitbucket.updatePullRequest(
          branch.repo,
          prId,
          {
            version: pr.version,
            title: pr.title,
            description: appendJiraKey(pr.description, jiraKey),
            reviewers: (pr.reviewers ?? []).map((r) => ({ user: { name: r.user.name } })),
          },
          creds
        );
      } catch (e) {
        // 409 = PR changed since we read it; re-read once and retry.
        if (attempt === 0 && String((e as Error).message).includes("-> 409")) continue;
        throw e;
      }

      await audit({
        actorId: actor.id,
        actorEmail: actor.email,
        action: "branch.pr_jira_sync",
        source: "web",
        target: `${branch.repo}:${branch.branch}`,
        after: { prId, jiraKey },
      });
      return done("updated");
    }
    return done("error");
  } catch (e) {
    return done(isBitbucketPermissionError(e) ? "forbidden" : "error");
  }
}

const REASON: Record<Exclude<PrSyncStatus, "updated" | "already_present">, string> = {
  no_pr: "chưa có PR",
  pr_closed: "PR đã đóng",
  pr_not_found: "không tìm thấy PR",
  no_credentials: "chưa cấu hình Bitbucket",
  forbidden: "không có quyền sửa PR",
  error: "lỗi khi sửa PR",
};

/** One-line Vietnamese summary for the UI toast. */
export function summarizePrSync(results: PrSyncResult[]): string {
  const updated = results.filter((r) => r.status === "updated").length;
  const skipped = results.filter((r) => r.status !== "updated" && r.status !== "already_present");
  const parts: string[] = [];
  if (updated > 0) parts.push(`đã cập nhật ${updated} PR để Jira nhận`);
  if (skipped.length > 0) {
    const detail = skipped
      .slice(0, 3)
      .map((r) => `${r.branch} (${REASON[r.status as keyof typeof REASON]})`)
      .join(", ");
    parts.push(`bỏ qua ${skipped.length} PR: ${detail}${skipped.length > 3 ? "…" : ""}`);
  }
  return parts.join("; ");
}
