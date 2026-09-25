import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { jiraWith } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { getIssueView } from "@/lib/issues/live";
import { refreshJiraIssueCache } from "@/lib/issues/cache";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user);
  if (!auth) {
    return NextResponse.json(
      { error: "Bạn cần cấu hình token Jira cá nhân trong Settings.", code: "jira_credentials_required" },
      { status: 428 }
    );
  }
  const view = await getIssueView(key, auth);
  if (!view) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ issue: view });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;
  const patch = (await req.json()) as {
    summary?: string;
    description?: string;
    assignee?: string | null;
    labels?: string[];
    priority?: string;
    points?: number | null;
    fixVersions?: string[];
    addFixVersion?: string;
    removeFixVersion?: string;
    addLabel?: string;
    removeLabel?: string;
  };

  // Act as the current user if they linked their own Jira token.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user);
  if (!auth) {
    return NextResponse.json(
      { error: "Bạn cần cấu hình token Jira cá nhân trong Settings.", code: "jira_credentials_required" },
      { status: 428 }
    );
  }
  const client = jiraWith(auth);

  try {
    const updatePayload: {
      summary?: string;
      description?: string;
      assignee?: string | null;
      labels?: string[];
      priority?: string;
      points?: number | null;
      fixVersions?: string[];
    } = {};

    if (patch.summary !== undefined) updatePayload.summary = patch.summary;
    if (patch.description !== undefined) updatePayload.description = patch.description;
    if (patch.assignee !== undefined) updatePayload.assignee = patch.assignee;
    if (patch.priority !== undefined) updatePayload.priority = patch.priority;
    if (patch.points !== undefined) updatePayload.points = patch.points;
    if (patch.fixVersions !== undefined) updatePayload.fixVersions = patch.fixVersions;

    // Handle add/remove labels
    if (patch.labels !== undefined) {
      updatePayload.labels = patch.labels;
    } else if (patch.addLabel || patch.removeLabel) {
      const issueRes = await client.getIssue(key, "labels");
      const curLabels = issueRes.fields.labels ?? [];
      let newLabels = [...curLabels];
      if (patch.addLabel) {
        const val = patch.addLabel.trim();
        if (val && !newLabels.includes(val)) newLabels.push(val);
      }
      if (patch.removeLabel) {
        const val = patch.removeLabel.trim();
        newLabels = newLabels.filter((l) => l !== val);
      }
      updatePayload.labels = newLabels;
    }

    // Handle add/remove fix version
    if (patch.addFixVersion || patch.removeFixVersion) {
      const projectKey = key.split("-")[0];
      const issueRes = await client.getIssue(key, "fixVersions");
      const current = (issueRes.fields.fixVersions ?? []).map((v) => v.id ?? "").filter(Boolean);
      let nextVersions = [...current];

      if (patch.addFixVersion) {
        const id = await client.resolveVersionId(projectKey, patch.addFixVersion.trim());
        if (!id) {
          return NextResponse.json(
            { error: `Không tìm thấy phiên bản "${patch.addFixVersion}" trong dự án ${projectKey}` },
            { status: 400 }
          );
        }
        if (!nextVersions.includes(id)) {
          nextVersions.push(id);
        }
      }

      if (patch.removeFixVersion) {
        const id = await client.resolveVersionId(projectKey, patch.removeFixVersion.trim());
        if (id) {
          nextVersions = nextVersions.filter((vId) => vId !== id);
        }
      }

      updatePayload.fixVersions = nextVersions;
    }

    // Push metadata changes to Jira (source of truth).
    await client.updateIssue(key, updatePayload);
  } catch (e) {
    return NextResponse.json({ error: `Jira update failed: ${(e as Error).message}` }, { status: 502 });
  }

  const cacheSynced = await refreshJiraIssueCache(client, key);
  return NextResponse.json({ ok: true, cacheSynced });
}
