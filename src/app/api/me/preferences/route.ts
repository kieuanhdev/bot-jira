import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { BoardProjectsBodySchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { enqueueJiraProjectSync } from "@/lib/queue/boss";
import {
  listActiveProjects,
  normalizeProjectKey,
} from "@/lib/jira/project-catalog";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith } from "@/lib/jira/client";
import { getMePreferences } from "@/lib/me/preferences";

/** Current user's board preference: which project keys they want to see. */
export async function GET() {
  const reqStart = Date.now();
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await getMePreferences(session.user.id);

  const dur = Date.now() - reqStart;
  return NextResponse.json(body, {
    headers: {
      "Server-Timing": `total;dur=${dur}`,
    },
  });
}

/** Save the set of project keys the user wants on their board. */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsedBody = await readJsonBody(req, BoardProjectsBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const { projects } = parsedBody.data;

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

  // Automatically enqueue sync for newly selected projects (admin-disabled ones stay frozen)
  const syncEnabledKeys = new Set(activeCatalog.filter((p) => p.syncEnabled).map((p) => p.key));
  for (const newKey of newProjects.filter((key) => syncEnabledKeys.has(key))) {
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
