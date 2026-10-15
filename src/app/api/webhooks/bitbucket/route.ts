import { NextResponse } from "next/server";
import { handleWebhook } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * Bitbucket Data Center webhook receiver (M5-02).
 *
 * Payload: `{ eventKey: "pr:opened|pr:merged|repo:refs_changed|...", data: {
 * repository: { slug, project: { key } }, pullRequest?: { id, state,
 * fromRef: { branch }, toRef: { branch } }, branches?: [...] } }`.
 *
 * External event id: Bitbucket DC does not send a unique event id, so we
 * synthesize one from eventKey + repo + the most specific subject (PR id or
 * branch name). This dedupes redeliveries of the same PR state change.
 */
function bbExternalId(json: unknown): string {
  const j = json as {
    eventKey?: string;
    data?: {
      repository?: { slug?: string; project?: { key?: string } };
      pullRequest?: { id?: number; state?: string };
      comment?: { id?: number };
      branches?: Array<{ name?: string }>;
      commit?: { id?: string } | string;
    };
    repository?: { slug?: string; project?: { key?: string } };
    pullRequest?: {
      id?: number;
      state?: string;
      toRef?: { repository?: { slug?: string; project?: { key?: string } } };
    };
    comment?: { id?: number };
    commit?: { id?: string } | string;
  };
  const repoObj =
    j.data?.repository ??
    j.pullRequest?.toRef?.repository ??
    j.repository;
  const repo = repoObj
    ? `${repoObj.project?.key ?? "?"}/${repoObj.slug ?? "?"}`
    : "unknown";
  const pr = j.pullRequest ?? j.data?.pullRequest;
  const comment = j.comment ?? j.data?.comment;
  const branch = j.data?.branches?.[0]?.name;
  const rawCommit = j.commit ?? j.data?.commit;
  const commitId = typeof rawCommit === "string" ? rawCommit : rawCommit?.id;

  let subject = "event";
  if (comment?.id && pr?.id) {
    subject = `pr-${pr.id}-comment-${comment.id}`;
  } else if (comment?.id && commitId) {
    subject = `commit-${commitId.slice(0, 12)}-comment-${comment.id}`;
  } else if (pr) {
    subject = `pr-${pr.id}-${pr.state ?? ""}`;
  } else if (branch) {
    subject = `branch-${branch}`;
  } else if (commitId) {
    subject = `commit-${commitId.slice(0, 12)}`;
  }

  return `${j.eventKey ?? "event"}:${repo}:${subject}`;
}

export async function POST(req: Request) {
  return handleWebhook("bitbucket", req, (json) => {
    const j = json as {
      eventKey?: string;
      data?: {
        repository?: { slug?: string; project?: { key?: string } };
        pullRequest?: { id?: number };
      };
      repository?: { slug?: string; project?: { key?: string } };
      pullRequest?: {
        id?: number;
        toRef?: { repository?: { slug?: string; project?: { key?: string } } };
      };
    };
    const repoObj =
      j.data?.repository ??
      j.pullRequest?.toRef?.repository ??
      j.repository;

    return {
      externalId: bbExternalId(json),
      type: j.eventKey ?? "bitbucket-event",
      subject: repoObj
        ? `${repoObj.project?.key ?? "?"}/${repoObj.slug ?? "?"}`
        : null,
    };
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, source: "bitbucket" });
}
