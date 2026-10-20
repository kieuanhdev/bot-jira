import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getSystemJiraAuth, jiraWith } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { getCachedIssueView, getIssueView } from "@/lib/issues/live";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";
import { audit } from "@/lib/audit";
import { markIssuesDeleted } from "@/lib/issues/deleted";
import { getProjectPeopleFields } from "@/lib/jira/people-fields";
import { logSwallowed } from "@/lib/logger";
import { isDateKey } from "@/lib/date";
import { readJsonBody } from "@/lib/api/json-body";
import { IssuePatchBodySchema } from "@/lib/api/schemas";

export async function handleIssueDetailRequest(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;

  // Fast path: `?source=cache` serves the DB snapshot without calling Jira.
  if (new URL(req.url).searchParams.get("source") === "cache") {
    const cachedView = await getCachedIssueView(key);
    if (!cachedView) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ issue: cachedView });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user) || (await getSystemJiraAuth());
  const view = await getIssueView(key, auth);
  if (!view) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ issue: view });
}

export async function handleIssueUpdateRequest(
  req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;
  const patchResult = await readJsonBody(req, IssuePatchBodySchema, { maxBytes: 512 * 1024 });
  if (!patchResult.ok) return patchResult.response;
  const patch = patchResult.data;

  // Act as the current user if they linked their own Jira token.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user);
  if (!auth) {
    return jiraCredentialsRequired();
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
      issueType?: string;
      dueDate?: string | null;
      epic?: string | null;
      extraFields?: Record<string, unknown>;
    } = {};

    if (patch.summary !== undefined) updatePayload.summary = patch.summary;
    if (patch.description !== undefined) updatePayload.description = patch.description;
    if (patch.assignee !== undefined) updatePayload.assignee = patch.assignee;
    if (patch.priority !== undefined) updatePayload.priority = patch.priority;
    if (patch.points !== undefined) updatePayload.points = patch.points;
    if (patch.fixVersions !== undefined) updatePayload.fixVersions = patch.fixVersions;

    if (patch.issueType !== undefined) updatePayload.issueType = patch.issueType;
    if (patch.dueDate !== undefined) {
      if (patch.dueDate !== null && !isDateKey(patch.dueDate)) {
        return NextResponse.json({ error: "dueDate must be YYYY-MM-DD" }, { status: 400 });
      }
      updatePayload.dueDate = patch.dueDate;
    }
    if (patch.epic !== undefined) updatePayload.epic = patch.epic;

    // People fields: the Jira field id is configured per project.
    const peopleEdits = (["reporter", "approver", "tester"] as const).filter((r) => patch[r] !== undefined);
    if (peopleEdits.length > 0) {
      const map = await getProjectPeopleFields(key.split("-")[0]);
      const extra: Record<string, unknown> = {};
      for (const role of peopleEdits) {
        const fieldId = map[role];
        if (!fieldId) {
          return NextResponse.json(
            { error: `Dự án chưa cấu hình trường ${role}` },
            { status: 400 }
          );
        }
        const name = patch[role];
        extra[fieldId] = name ? { name } : null;
      }
      updatePayload.extraFields = extra;
    }

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

    // Eagerly update local DB cache so immediate DB reads reflect the changes
    const directUpdate: Record<string, unknown> = { updatedAt: new Date() };
    if (updatePayload.points !== undefined) directUpdate.points = updatePayload.points;
    if (updatePayload.priority !== undefined) directUpdate.priority = updatePayload.priority;
    if (updatePayload.assignee !== undefined) directUpdate.assigneeJira = updatePayload.assignee;
    if (updatePayload.summary !== undefined) directUpdate.summary = updatePayload.summary;
    if (updatePayload.description !== undefined) directUpdate.description = updatePayload.description;
    if (updatePayload.labels !== undefined) directUpdate.labels = updatePayload.labels;
    if (updatePayload.issueType !== undefined) directUpdate.type = updatePayload.issueType;
    if (updatePayload.dueDate !== undefined) {
      directUpdate.dueDate = updatePayload.dueDate ? new Date(`${updatePayload.dueDate}T00:00:00.000Z`) : null;
    }
    if (updatePayload.epic !== undefined) directUpdate.epicKey = updatePayload.epic;
    if (patch.reporter !== undefined) directUpdate.reporterJira = patch.reporter;
    if (patch.approver !== undefined) directUpdate.approverJira = patch.approver;
    if (patch.tester !== undefined) directUpdate.testerJira = patch.tester;

    // Keep the local release membership (ReleaseTask) and cached fix versions in
    // step with Jira so the release page reflects the change immediately.
    if (patch.addFixVersion || patch.removeFixVersion) {
      await syncLocalFixVersion(key, patch.addFixVersion?.trim(), patch.removeFixVersion?.trim()).catch((err) => {
        logSwallowed("issue_detail_sync_fix_version", err, { key });
        return null;
      });
    }

    if (Object.keys(directUpdate).length > 1) {
      await prisma.issueCache
        .updateMany({
          where: { jiraKey: key },
          data: directUpdate,
        })
        .catch((err) => {
          logSwallowed("issue_detail_update_cache", err, { key });
          return null;
        });
    }
  } catch (e) {
    return NextResponse.json({ error: `Jira update failed: ${(e as Error).message}` }, { status: 502 });
  }

  const cacheSynced = await refreshJiraIssueCache(client, key, {
    excludeUserId: session.user.id,
  });
  return NextResponse.json({ ok: true, cacheSynced });
}

async function syncLocalFixVersion(key: string, add?: string, remove?: string) {
  const projectKey = key.split("-")[0];
  const issue = await prisma.issueCache.findUnique({
    where: { jiraKey: key },
    select: { fixVersionNames: true },
  });
  if (!issue) return;

  const names = new Set(issue.fixVersionNames);
  if (add) names.add(add);
  if (remove) names.delete(remove);
  await prisma.issueCache.update({ where: { jiraKey: key }, data: { fixVersionNames: [...names] } });

  if (add) {
    const releases = await prisma.release.findMany({ where: { projectKey, version: add }, select: { id: true } });
    if (releases.length > 0) {
      await prisma.releaseTask.createMany({
        data: releases.map((r) => ({ releaseId: r.id, jiraKey: key })),
        skipDuplicates: true,
      });
    }
  }
  if (remove) {
    await prisma.releaseTask.deleteMany({
      where: { jiraKey: key, release: { projectKey, version: remove } },
    });
  }
}

/** Delete the issue in Jira as the signed-in user, then hide it locally. */
export async function handleIssueDeleteRequest(
  _req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key: rawKey } = await ctx.params;
  const key = rawKey?.trim().toUpperCase() ?? "";
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) {
    return NextResponse.json({ error: "Mã task không hợp lệ." }, { status: 400 });
  }

  // Deleting is destructive, so it only ever runs with the user's own Jira token.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user);
  if (!auth) return jiraCredentialsRequired();

  try {
    await jiraWith(auth).deleteIssue(key);
  } catch (e) {
    const status = (e as { status?: number })?.status;
    // Already gone in Jira: fall through and sync the local cache.
    if (status !== 404) {
      if (status === 401 || status === 403) {
        return NextResponse.json(
          { error: "Bạn không có quyền xóa task này trên Jira." },
          { status: 403 }
        );
      }
      if (status === 400) {
        return NextResponse.json(
          { error: "Jira không cho xóa task này (ví dụ còn subtask). Hãy xóa subtask trước." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: `Không xóa được task trên Jira: ${(e as Error).message}` },
        { status: 502 }
      );
    }
  }

  await markIssuesDeleted([key]);
  await audit({
    actorId: session.user.id,
    actorEmail: session.user.email ?? null,
    action: "issue.delete",
    target: key,
  });
  return NextResponse.json({ ok: true, key });
}
