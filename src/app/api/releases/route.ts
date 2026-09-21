import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** List all releases with their task counts. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const releases = await prisma.release.findMany({
    orderBy: { createdAt: "desc" },
    include: { tasks: { select: { jiraKey: true, issue: { select: { status: true, summary: true, points: true, priority: true } } } } },
  });
  return NextResponse.json({ items: releases });
}

/** Create a release by version + target label. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { version, targetLabel, notes } = (await req.json()) as {
    version: string;
    targetLabel: string;
    notes?: string;
  };
  if (!version || !targetLabel) {
    return NextResponse.json({ error: "version and targetLabel required" }, { status: 400 });
  }
  const release = await prisma.release.upsert({
    where: { targetLabel },
    update: { version, ...(notes !== undefined ? { notes } : {}) },
    create: { version, targetLabel, notes: notes ?? "" },
  });

  // Attach all cached issues carrying the target label.
  const issues = await prisma.issueCache.findMany({
    where: { labels: { has: targetLabel } },
    select: { jiraKey: true },
  });
  if (issues.length) {
    await prisma.releaseTask.createMany({
      data: issues.map((i) => ({ releaseId: release.id, jiraKey: i.jiraKey })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ release });
}
