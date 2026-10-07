import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { jiraUsernameAliases, userJiraUsername, userJiraAuth } from "@/lib/user-creds";
import { getSystemJiraAuth, jiraWith } from "@/lib/jira/client";
import { enqueueJiraProjectSync } from "@/lib/queue/boss";
import {
  listActiveProjects,
  normalizeProjectKey,
  isValidProjectKeyFormat,
  registerVerifiedProject,
  updateProjectBootstrapState,
} from "@/lib/jira/project-catalog";
import { detectPeopleFields } from "@/lib/jira/people-fields";

/**
 * Project list and open counts from the shared Jira catalog and read model.
 * Returns all active catalog projects with their selection state for current user.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUsername: true, jiraUserEnc: true, boardProjects: true },
  });
  if (!user) return NextResponse.json({ error: "session_invalid" }, { status: 401 });

  const activeCatalog = await listActiveProjects();
  const activeKeys = new Set(activeCatalog.map((p) => p.key));

  const userSelectedKeys = new Set(
    (user.boardProjects || [])
      .map(normalizeProjectKey)
      .filter((k) => activeKeys.has(k))
  );

  const jiraUsername = userJiraUsername(user);
  const jiraUserAliases = jiraUsernameAliases(jiraUsername);

  const grouped = jiraUsername && activeKeys.size > 0
    ? await prisma.issueCache.groupBy({
        by: ["projectKey"],
        where: {
          projectKey: { in: Array.from(activeKeys) },
          assigneeJira: { in: jiraUserAliases },
          statusCategory: { not: "done" },
          deletedAt: null,
        },
        _count: { _all: true },
      })
    : [];

  const counts = new Map(grouped.map((row) => [row.projectKey, row._count._all]));

  const items = activeCatalog.map((project) => ({
    key: project.key,
    name: project.name || project.key,
    selected: userSelectedKeys.has(project.key),
    openCount: counts.get(project.key) ?? 0,
    dataState: project.bootstrapState ?? "ready",
  }));

  return NextResponse.json({ items });
}

/**
 * Register a new project in the shared catalog, verify Jira access,
 * add it to current user's preferences, and enqueue initial sync bootstrap.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { key?: string };
  const rawKey = normalizeProjectKey(body.key ?? "");

  if (!rawKey) {
    return NextResponse.json({ ok: false, error: "Vui lòng nhập mã dự án." }, { status: 400 });
  }

  if (!isValidProjectKeyFormat(rawKey)) {
    return NextResponse.json(
      { ok: false, error: "Mã dự án không hợp lệ (ví dụ: PROJ, MOBILE, EPM)." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, boardProjects: true },
  });

  const auth = userJiraAuth(user) ?? (await getSystemJiraAuth());
  if (!auth) {
    return NextResponse.json(
      { ok: false, error: "Chưa cấu hình tài khoản Jira. Vui lòng kết nối Jira trước." },
      { status: 428 }
    );
  }

  const client = jiraWith(auth);

  let jiraProject: { key: string; name?: string; id?: string };
  try {
    const fetched = await client.getProject(rawKey);
    if (!fetched || !fetched.key) {
      return NextResponse.json(
        { ok: false, error: `Không tìm thấy thông tin dự án ${rawKey} trên Jira.` },
        { status: 404 }
      );
    }
    jiraProject = fetched;
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status === 404) {
      return NextResponse.json(
        { ok: false, error: `Dự án "${rawKey}" không tồn tại trên hệ thống Jira.` },
        { status: 404 }
      );
    }
    if (err.status === 401 || err.status === 403) {
      return NextResponse.json(
        { ok: false, error: `Tài khoản Jira của bạn không có quyền truy cập dự án "${rawKey}".` },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { ok: false, error: err.message || `Lỗi khi kiểm tra dự án "${rawKey}" trên Jira.` },
      { status: 500 }
    );
  }

  const verifiedKey = normalizeProjectKey(jiraProject.key);
  const projectName = jiraProject.name || verifiedKey;

  // Upsert into JiraProject catalog
  const catalogItem = await registerVerifiedProject({
    key: verifiedKey,
    name: projectName,
    jiraId: jiraProject.id ?? null,
    discoveredById: session.user.id,
    source: "user_added",
    bootstrapState: "syncing_issues",
  });

  // Detection is best-effort: an empty project or restricted editmeta must not
  // prevent registration and the initial full sync.
  await detectPeopleFields(verifiedKey, client).catch((error) => {
    console.warn(`Failed to detect people fields for ${verifiedKey}:`, error);
  });

  // Add key to user's board preferences
  const currentBoardProjects = (user?.boardProjects ?? []).map(normalizeProjectKey);
  if (!currentBoardProjects.includes(verifiedKey)) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { boardProjects: [...currentBoardProjects, verifiedKey] },
    });
  }

  // Enqueue initial sync job
  let syncJobId: string | null = null;
  let queueFailed = false;
  try {
    syncJobId = await enqueueJiraProjectSync({
      projectKey: verifiedKey,
      full: true,
      source: "manual",
      requestedBy: session.user.id,
    });
  } catch (err) {
    queueFailed = true;
    console.error(`Failed to enqueue initial sync for ${verifiedKey}:`, err);
    await updateProjectBootstrapState(
      verifiedKey,
      "failed",
      err instanceof Error ? err.message : String(err)
    );
  }

  return NextResponse.json(
    {
      ok: true,
      created: true,
      project: {
        key: verifiedKey,
        name: catalogItem.name,
        selected: true,
      },
      bootstrap: {
        state: queueFailed ? "queue_failed" : "queued",
        issueSyncJobId: syncJobId,
      },
    },
    { status: queueFailed ? 200 : 202 }
  );
}
