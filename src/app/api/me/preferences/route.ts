import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { enqueueJiraProjectSync } from "@/lib/queue/boss";
import {
  listActiveProjects,
  normalizeProjectKey,
} from "@/lib/jira/project-catalog";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith } from "@/lib/jira/client";

/** Current user's board preference: which project keys they want to see. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [user, activeCatalog] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { boardProjects: true },
    }),
    listActiveProjects(),
  ]);

  const activeKeys = new Set(activeCatalog.map((p) => p.key));
  const userProjects = (user?.boardProjects ?? [])
    .map(normalizeProjectKey)
    .filter((k) => activeKeys.has(k));

  return NextResponse.json({
    projects: userProjects,
    available: activeCatalog.map((p) => p.key),
  });
}

/** Save the set of project keys the user wants on their board. */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { projects } = (await req.json().catch(() => ({}))) as { projects?: string[] };

  const [user, activeCatalog] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        boardProjects: true,
        jiraUserEnc: true,
        jiraTokenEnc: true,
        jiraAuth: true,
      },
    }),
    listActiveProjects(),
  ]);

  if (!user) return NextResponse.json({ error: "session_invalid" }, { status: 401 });

  const activeKeys = new Set(activeCatalog.map((p) => p.key));
  const cleaned = Array.from(
    new Set(
      (Array.isArray(projects) ? projects : [])
        .map(normalizeProjectKey)
        .filter((p) => activeKeys.has(p))
    )
  );

  const prevSet = new Set((user.boardProjects || []).map(normalizeProjectKey));
  const newProjects = cleaned.filter((p) => !prevSet.has(p));

  // If user has personal Jira credentials and selects new projects, verify permissions
  const auth = userJiraAuth(user);
  if (auth && newProjects.length > 0) {
    const client = jiraWith(auth);
    for (const key of newProjects) {
      try {
        const p = await client.getProject(key);
        if (!p?.key) {
          return NextResponse.json(
            {
              error: "jira_project_permission_required",
              message: `Không thể truy cập dự án "${key}" trên Jira.`,
              projectKey: key,
            },
            { status: 403 }
          );
        }
      } catch (error: unknown) {
        const err = error as { status?: number; message?: string };
        if (err.status === 401 || err.status === 403) {
          return NextResponse.json(
            {
              error: "jira_project_permission_required",
              message: `Tài khoản Jira của bạn không có quyền truy cập dự án "${key}".`,
              projectKey: key,
            },
            { status: 403 }
          );
        }
      }
    }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { boardProjects: cleaned },
  });

  // Automatically enqueue sync for newly selected projects
  for (const newKey of newProjects) {
    try {
      await enqueueJiraProjectSync({
        projectKey: newKey,
        full: false,
        source: "manual",
        requestedBy: session.user.id,
      });
    } catch {
      // background enqueue failure should not block saving preferences
    }
  }

  return NextResponse.json({ projects: cleaned });
}
