import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** Stale ranking: assignees ranked by number of stale tasks + total idle days. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Latest stale snapshot per issue (most recent detection).
  const latest = await prisma.staleSnapshot.findMany({
    orderBy: { detectedAt: "desc" },
  });
  const byIssue = new Map<string, { jiraKey: string; assignee: string | null; ageDays: number; detectedAt: Date }>();
  for (const s of latest) {
    if (!byIssue.has(s.jiraKey)) byIssue.set(s.jiraKey, s);
  }

  // Aggregate by assignee.
  const agg = new Map<string, { count: number; totalDays: number }>();
  const tasks: { jiraKey: string; assignee: string | null; ageDays: number }[] = [];
  for (const s of byIssue.values()) {
    const key = s.assignee ?? "(unassigned)";
    const entry = agg.get(key) ?? { count: 0, totalDays: 0 };
    entry.count += 1;
    entry.totalDays += s.ageDays;
    agg.set(key, entry);
    tasks.push({ jiraKey: s.jiraKey, assignee: s.assignee, ageDays: s.ageDays });
  }

  const ranking = Array.from(agg.entries())
    .map(([assignee, v]) => ({ assignee, count: v.count, totalDays: v.totalDays }))
    .sort((a, b) => b.totalDays - a.totalDays || b.count - a.count);

  return NextResponse.json({ ranking, tasks });
}
