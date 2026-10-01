import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { recordSearchMetrics } from "@/lib/bulk/create-metrics";

const LABEL_CACHE_TTL_MS = 120_000;
const labelCache = new Map<string, { labels: string[]; expiresAt: number }>();

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const project = url.searchParams.get("project")?.trim().toUpperCase();
  if (!project) {
    return NextResponse.json({ error: "Missing project query parameter" }, { status: 400 });
  }

  const rawQuery = url.searchParams.get("q")?.trim() ?? "";
  const query = rawQuery.toLowerCase().slice(0, 100);
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)), 50);

  const cacheKey = `${project}:${query}:${limit}`;
  const cached = labelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ labels: cached.labels });
  }

  const searchStart = Date.now();
  try {
    const issues = await prisma.issueCache.findMany({
      where: {
        projectKey: project,
        deletedAt: null,
      },
      select: { labels: true },
      take: 1000,
      orderBy: { lastSyncedAt: "desc" },
    });

    const labelSet = new Map<string, number>();
    for (const issue of issues) {
      for (const label of issue.labels) {
        const normalized = label.trim();
        if (!normalized) continue;
        if (query && !normalized.toLowerCase().includes(query)) continue;
        labelSet.set(normalized, (labelSet.get(normalized) ?? 0) + 1);
      }
    }

    const distinctLabels = [...labelSet.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([label]) => label);

    const durationMs = Date.now() - searchStart;
    recordSearchMetrics({
      type: "labels",
      projectKey: project,
      query,
      durationMs,
      resultCount: distinctLabels.length,
    });

    labelCache.set(cacheKey, { labels: distinctLabels, expiresAt: Date.now() + LABEL_CACHE_TTL_MS });
    return NextResponse.json({ labels: distinctLabels });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
