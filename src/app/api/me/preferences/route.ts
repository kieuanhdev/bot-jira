import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { jiraProjectList } from "@/lib/env";
import { enqueueJiraSync } from "@/lib/queue/boss";

/** Current user's board preference: which project keys they want to see. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { boardProjects: true },
  });
  const userProjects = user?.boardProjects ?? [];
  const available = Array.from(new Set([...jiraProjectList, ...userProjects]));
  return NextResponse.json({
    projects: userProjects,
    available,
  });
}

/** Save the set of project keys the user wants on their board. Empty = all. */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { projects } = (await req.json()) as { projects?: string[] };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, boardProjects: true },
  });
  if (!user) return NextResponse.json({ error: "session_invalid" }, { status: 401 });

  const knownKeys = new Set([...jiraProjectList, ...user.boardProjects]);
  const cleaned = (Array.isArray(projects) ? projects : [])
    .map((p) => String(p).trim().toUpperCase())
    .filter((p) => knownKeys.has(p) || /^[A-Z][A-Z0-9_]{1,19}$/.test(p));

  const prevSet = new Set(user.boardProjects);
  const newProjects = cleaned.filter((p) => !prevSet.has(p));

  await prisma.user.update({
    where: { id: session.user.id },
    data: { boardProjects: cleaned },
  });

  // Automatically enqueue sync for newly added projects
  for (const newKey of newProjects) {
    try {
      await enqueueJiraSync({ projectKey: newKey, requestedBy: session.user.id });
    } catch {
      // background enqueue failure should not block saving preferences
    }
  }

  return NextResponse.json({ projects: cleaned });
}
