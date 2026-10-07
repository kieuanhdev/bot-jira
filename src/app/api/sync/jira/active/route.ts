import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type ActiveJiraSync = {
  projectKey: string;
  startedAt: string | null;
};

export type ActiveJiraSyncResponse = {
  syncingProjects: string[];
  activeSyncs: ActiveJiraSync[];
  timestamp: string;
};

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const nowMs = now.getTime();

    const cursors = await prisma.integrationCursor.findMany({
      where: { integration: "jira" },
      select: {
        scope: true,
        lastStartedAt: true,
        lastSuccessAt: true,
        lastErrorAt: true,
        activeRunToken: true,
        activeRunExpiresAt: true,
        activeRunStartedAt: true,
      },
    });

    const activeSyncs: ActiveJiraSync[] = [];

    for (const cursor of cursors) {
      const isLeaseActive = Boolean(
        cursor.activeRunToken &&
          cursor.activeRunExpiresAt &&
          cursor.activeRunExpiresAt.getTime() > nowMs
      );

      const startedMs = cursor.lastStartedAt?.getTime() ?? 0;
      const successMs = cursor.lastSuccessAt?.getTime() ?? 0;
      const errorMs = cursor.lastErrorAt?.getTime() ?? 0;

      const isStartedActive = Boolean(
        cursor.lastStartedAt &&
          startedMs > successMs &&
          startedMs > errorMs &&
          nowMs - startedMs < 10 * 60_000
      );

      if (isLeaseActive || isStartedActive) {
        activeSyncs.push({
          projectKey: cursor.scope,
          startedAt: (cursor.activeRunStartedAt || cursor.lastStartedAt)?.toISOString() ?? null,
        });
      }
    }

    const syncingProjects = activeSyncs.map((s) => s.projectKey);

    return NextResponse.json({
      syncingProjects,
      activeSyncs,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "internal_error", message: (error as Error).message },
      { status: 500 }
    );
  }
}
