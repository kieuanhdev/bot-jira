import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { userBitbucketCreds } from "@/lib/user-creds";
import { createTaskPullRequests, planTaskPullRequests } from "@/lib/bitbucket/pr-create";

const MAX_BRANCHES = 50;

function stringList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
}

/**
 * Bulk-create pull requests for the branches linked to one Jira task.
 * Body: { jiraKey, branchIds?, targets?: {branchId: targetBranch}, reviewers?, dryRun? }
 * `dryRun: true` returns the plan (repo → target, skip reasons) without creating anything.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session, "branch.manage")) {
    return NextResponse.json({ error: "forbidden: requires branch.manage" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const jiraKey = typeof body.jiraKey === "string" ? body.jiraKey.trim().toUpperCase() : "";
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(jiraKey)) {
    return NextResponse.json({ error: "Thiếu hoặc sai mã Jira" }, { status: 400 });
  }
  const branchIds = stringList(body.branchIds);
  if (branchIds && branchIds.length > MAX_BRANCHES) {
    return NextResponse.json({ error: `Tối đa ${MAX_BRANCHES} nhánh mỗi lần` }, { status: 400 });
  }
  const targets: Record<string, string> = {};
  if (body.targets && typeof body.targets === "object") {
    for (const [id, v] of Object.entries(body.targets as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) targets[id] = v.trim();
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { bitbucketUserEnc: true, bitbucketTokenEnc: true },
  });
  const creds = userBitbucketCreds(user);
  if (!creds) {
    return NextResponse.json(
      { error: "Bạn cần cấu hình Bitbucket trong Settings để tạo PR.", code: "bitbucket_credentials_required" },
      { status: 428 }
    );
  }

  if (body.dryRun === true) {
    const plan = await planTaskPullRequests(jiraKey, creds, { branchIds, targets });
    if (!plan) return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });
    return NextResponse.json({ ok: true, plan });
  }

  const res = await createTaskPullRequests(
    jiraKey,
    creds,
    { id: session.user.id, email: session.user.email ?? undefined },
    { branchIds, targets, reviewers: stringList(body.reviewers) }
  );
  if (!res) return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });
  return NextResponse.json({ ok: true, summary: res.summary, results: res.results });
}
