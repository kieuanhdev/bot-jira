import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { jiraProjectList } from "@/lib/env";

/** Current user's board preference: which project keys they want to see. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { boardProjects: true },
  });
  return NextResponse.json({
    projects: user?.boardProjects ?? [],
    available: jiraProjectList,
  });
}

/** Save the set of project keys the user wants on their board. Empty = all. */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { projects } = (await req.json()) as { projects?: string[] };
  const cleaned = (Array.isArray(projects) ? projects : [])
    .map((p) => String(p).trim().toUpperCase())
    .filter((p) => jiraProjectList.includes(p));
  const exists = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  await prisma.user.update({
    where: { id: session.user.id },
    data: { boardProjects: cleaned },
  });
  return NextResponse.json({ projects: cleaned });
}
