import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { normalizeProjectKey, setProjectSyncEnabled } from "@/lib/jira/project-catalog";
import { enqueueJiraDispatch, enqueueJiraProjectSync } from "@/lib/queue/boss";

export type AdminSyncState = "disabled" | "running" | "failed" | "ok" | "never";

export type AdminProjectSyncRow = {
  key: string;
  name: string;
  source: string;
  syncEnabled: boolean;
  bootstrapState: string | null;
  issueCount: number;
  state: AdminSyncState;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
};

type Actor = { id: string; email?: string | null };

/** Strip credential-looking fragments before showing a sync error in the browser. */
export function sanitizeSyncError(error: string | null): string | null {
  return error ? error.replace(/(token|password|bearer|auth)[=:\s]+[^\s,;]+/gi, "$1=***").slice(0, 300) : null;
}

export function deriveSyncState(
  syncEnabled: boolean,
  cursor: {
    lastStartedAt: Date | null;
    lastSuccessAt: Date | null;
    lastErrorAt: Date | null;
    activeRunToken: string | null;
    activeRunExpiresAt: Date | null;
  } | null,
  now = Date.now()
): AdminSyncState {
  if (!syncEnabled) return "disabled";
  if (!cursor) return "never";
  if (cursor.activeRunToken && cursor.activeRunExpiresAt && cursor.activeRunExpiresAt.getTime() > now) {
    return "running";
  }
  const success = cursor.lastSuccessAt?.getTime() ?? 0;
  const error = cursor.lastErrorAt?.getTime() ?? 0;
  if (error > success) return "failed";
  return success > 0 ? "ok" : "never";
}

/** Every active catalog project with its sync switch and latest cursor outcome. */
export async function listAdminProjectSync(): Promise<AdminProjectSyncRow[]> {
  const projects = await prisma.jiraProject.findMany({
    where: { active: true },
    orderBy: [{ key: "asc" }],
    select: { key: true, name: true, source: true, syncEnabled: true, bootstrapState: true },
  });
  const keys = projects.map((p) => p.key);
  const [cursors, counts] = await Promise.all([
    prisma.integrationCursor.findMany({
      where: { integration: "jira", scope: { in: keys } },
      select: {
        scope: true,
        lastStartedAt: true,
        lastSuccessAt: true,
        lastErrorAt: true,
        lastError: true,
        activeRunToken: true,
        activeRunExpiresAt: true,
      },
    }),
    prisma.issueCache.groupBy({
      by: ["projectKey"],
      where: { projectKey: { in: keys }, deletedAt: null },
      _count: { _all: true },
    }),
  ]);
  const cursorByKey = new Map(cursors.map((c) => [c.scope.toUpperCase(), c]));
  const countByKey = new Map(counts.map((c) => [c.projectKey, c._count._all]));

  return projects.map((p) => {
    const cursor = cursorByKey.get(p.key) ?? null;
    return {
      key: p.key,
      name: p.name || p.key,
      source: p.source,
      syncEnabled: p.syncEnabled,
      bootstrapState: p.bootstrapState,
      issueCount: countByKey.get(p.key) ?? 0,
      state: deriveSyncState(p.syncEnabled, cursor),
      lastStartedAt: cursor?.lastStartedAt?.toISOString() ?? null,
      lastSuccessAt: cursor?.lastSuccessAt?.toISOString() ?? null,
      lastErrorAt: cursor?.lastErrorAt?.toISOString() ?? null,
      lastError: sanitizeSyncError(cursor?.lastError ?? null),
    };
  });
}

/**
 * Turn one project's sync on or off. Re-enabling queues an incremental sync so
 * the kept cursor catches up on the gap. A run already in progress is not
 * interrupted; the worker gate stops every later run.
 */
export async function toggleProjectSync(key: string, enabled: boolean, actor: Actor) {
  const projectKey = normalizeProjectKey(key);
  const result = await setProjectSyncEnabled(projectKey, enabled);
  if (!result) return null;

  if (result.previous !== enabled) {
    await audit({
      actorId: actor.id,
      actorEmail: actor.email ?? null,
      action: enabled ? "project.sync_enable" : "project.sync_disable",
      source: "web",
      target: projectKey,
      before: { syncEnabled: result.previous },
      after: { syncEnabled: enabled },
    });
  }

  let syncJobId: string | null = null;
  if (enabled && !result.previous) {
    syncJobId = await enqueueJiraProjectSync({
      projectKey,
      source: "admin",
      requestedBy: actor.id,
    }).catch(() => null);
  }
  return { key: projectKey, syncEnabled: enabled, syncJobId };
}

/** Turn sync on or off for every active project at once. */
export async function toggleAllProjectSync(enabled: boolean, actor: Actor) {
  const changed = await prisma.jiraProject.findMany({
    where: { active: true, syncEnabled: !enabled },
    select: { key: true },
  });
  const keys = changed.map((p) => p.key);
  if (keys.length === 0) return { changed: [] as string[] };

  await prisma.jiraProject.updateMany({
    where: { key: { in: keys } },
    data: { syncEnabled: enabled },
  });
  await audit({
    actorId: actor.id,
    actorEmail: actor.email ?? null,
    action: enabled ? "project.sync_enable_all" : "project.sync_disable_all",
    source: "web",
    target: keys.join(","),
    before: { syncEnabled: !enabled, projects: keys },
    after: { syncEnabled: enabled, projects: keys },
  });
  if (enabled) {
    await enqueueJiraDispatch({ source: "admin", requestedBy: actor.id }).catch(() => null);
  }
  return { changed: keys };
}
