import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listActiveProjects } from "@/lib/jira/project-catalog";
import { resolveAllowedProjects } from "@/lib/stale/params";
import type {
  ActiveJiraSync,
  ActiveJiraSyncResponse,
} from "@/lib/contracts/jira-sync";

export type {
  ActiveJiraSync,
  ActiveJiraSyncResponse,
} from "@/lib/contracts/jira-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const nowMs = now.getTime();

    // Only report syncs of projects this user works with; a sync elsewhere must
    // not trigger refetches on their screens.
    const [dbUser, catalog] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { boardProjects: true },
      }),
      listActiveProjects(),
    ]);
    const allowedProjects = resolveAllowedProjects(dbUser?.boardProjects ?? [], catalog);

    const cursors = await prisma.integrationCursor.findMany({
      where: { integration: "jira", scope: { in: allowedProjects } },
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

    const response: ActiveJiraSyncResponse = {
      syncingProjects,
      activeSyncs,
      timestamp: now.toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: "internal_error", message: (error as Error).message },
      { status: 500 }
    );
  }
}
