import { prisma } from "@/lib/prisma";
import { jiraProjectList } from "@/lib/env";

export type ProjectCatalogItem = {
  key: string;
  name: string;
  active: boolean;
  syncEnabled: boolean;
  syncFeatures?: unknown;
  bootstrapState?: string | null;
  lastBootstrapAt?: Date | null;
  lastBootstrapError?: string | null;
  source?: string;
};

export type RegisterProjectInput = {
  key: string;
  name: string;
  jiraId?: string | null;
  discoveredById?: string | null;
  source?: "bootstrap" | "user_added" | "admin" | "migration";
  bootstrapState?: string;
  lastValidationCode?: string | null;
};

export function normalizeProjectKey(key: string): string {
  return (key ?? "").trim().toUpperCase();
}

export function isValidProjectKeyFormat(key: string): boolean {
  return /^[A-Z][A-Z0-9_]{1,19}$/.test(normalizeProjectKey(key));
}

/** Fallback helper if DB is temporarily unreachable or empty during early startup. */
function getBootstrapFallback(): ProjectCatalogItem[] {
  const list = Array.isArray(jiraProjectList) ? jiraProjectList : [];
  return list.map((key) => ({
    key,
    name: key,
    active: true,
    syncEnabled: true,
    bootstrapState: "ready",
    source: "bootstrap",
  }));
}

/**
 * List all active projects in the catalog.
 * Read path from PostgreSQL, never calls Jira directly.
 */
export async function listActiveProjects(): Promise<ProjectCatalogItem[]> {
  try {
    const projects = await prisma.jiraProject.findMany({
      where: { active: true },
      orderBy: [{ key: "asc" }],
      select: {
        key: true,
        name: true,
        active: true,
        syncEnabled: true,
        syncFeatures: true,
        bootstrapState: true,
        lastBootstrapAt: true,
        lastBootstrapError: true,
        source: true,
      },
    });

    if (projects.length === 0) {
      console.warn(
        JSON.stringify({
          event: "jira_catalog_fallback",
          reason: "catalog_empty",
        })
      );
      return getBootstrapFallback();
    }

    return projects;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "jira_catalog_fallback",
        reason: "db_unavailable",
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return getBootstrapFallback();
  }
}

/**
 * List keys of all active projects with sync enabled.
 * Used by scheduler, worker dispatch, startup reconciliation, and health checks.
 */
export async function listSyncEnabledProjectKeys(): Promise<string[]> {
  try {
    const projects = await prisma.jiraProject.findMany({
      where: { active: true, syncEnabled: true },
      orderBy: [{ key: "asc" }],
      select: { key: true },
    });

    // Fall back to env only while the catalog is genuinely empty. Zero matches
    // in a populated catalog means an admin disabled every project.
    if (projects.length === 0 && (await prisma.jiraProject.count()) === 0) {
      console.warn(
        JSON.stringify({
          event: "jira_catalog_fallback",
          reason: "catalog_empty_sync_enabled",
        })
      );
      return Array.isArray(jiraProjectList) ? [...jiraProjectList] : [];
    }

    return projects.map((p) => p.key);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "jira_catalog_fallback",
        reason: "db_unavailable",
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return Array.isArray(jiraProjectList) ? [...jiraProjectList] : [];
  }
}

/**
 * Keys of catalog projects whose sync an admin turned off (or archived).
 * Projects missing from the catalog are not listed, so they keep syncing.
 */
export async function listSyncDisabledProjectKeys(): Promise<Set<string>> {
  try {
    const rows = await prisma.jiraProject.findMany({
      where: { OR: [{ active: false }, { syncEnabled: false }] },
      select: { key: true },
    });
    return new Set(rows.map((r) => normalizeProjectKey(r.key)));
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "jira_sync_disabled_lookup_failed",
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return new Set();
  }
}

/** False only when the project is in the catalog with sync turned off. */
export async function isProjectSyncEnabled(key: string): Promise<boolean> {
  const cleanKey = normalizeProjectKey(key);
  if (!cleanKey) return true;
  try {
    const project = await prisma.jiraProject.findUnique({
      where: { key: cleanKey },
      select: { active: true, syncEnabled: true },
    });
    return !project || (project.active && project.syncEnabled);
  } catch {
    return true;
  }
}

/** Enable or disable scheduled and manual sync for a catalog project. */
export async function setProjectSyncEnabled(
  key: string,
  enabled: boolean
): Promise<{ key: string; syncEnabled: boolean; previous: boolean } | null> {
  const cleanKey = normalizeProjectKey(key);
  const existing = await prisma.jiraProject.findUnique({
    where: { key: cleanKey },
    select: { key: true, syncEnabled: true },
  });
  if (!existing) return null;
  const updated = await prisma.jiraProject.update({
    where: { key: cleanKey },
    data: { syncEnabled: enabled },
    select: { key: true, syncEnabled: true },
  });
  return { ...updated, previous: existing.syncEnabled };
}

/**
 * Retrieve a project catalog entry by key (case-insensitive).
 */
export async function getCatalogProject(key: string): Promise<ProjectCatalogItem | null> {
  const cleanKey = normalizeProjectKey(key);
  if (!cleanKey) return null;

  try {
    const project = await prisma.jiraProject.findUnique({
      where: { key: cleanKey },
      select: {
        key: true,
        name: true,
        active: true,
        syncEnabled: true,
        bootstrapState: true,
        lastBootstrapAt: true,
        lastBootstrapError: true,
        source: true,
      },
    });

    return project;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "jira_catalog_fallback",
        reason: "db_unavailable",
        key: cleanKey,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    const list = Array.isArray(jiraProjectList) ? jiraProjectList : [];
    if (list.includes(cleanKey)) {
      return {
        key: cleanKey,
        name: cleanKey,
        active: true,
        syncEnabled: true,
        bootstrapState: "ready",
        source: "bootstrap",
      };
    }
    return null;
  }
}

/**
 * True when the project key is registered and active in the catalog.
 */
export async function isCatalogProject(key: string): Promise<boolean> {
  const cleanKey = normalizeProjectKey(key);
  if (!cleanKey) return false;

  const project = await getCatalogProject(cleanKey);
  return Boolean(project && project.active);
}

/**
 * Register a verified project into the catalog (idempotent upsert).
 */
export async function registerVerifiedProject(
  input: RegisterProjectInput
): Promise<ProjectCatalogItem> {
  const cleanKey = normalizeProjectKey(input.key);
  if (!cleanKey || !isValidProjectKeyFormat(cleanKey)) {
    throw new Error(`Invalid project key format: "${input.key}"`);
  }

  const name = (input.name || cleanKey).trim();
  const source = input.source ?? "user_added";
  const now = new Date();

  const existing = await prisma.jiraProject.findUnique({
    where: { key: cleanKey },
  });

  let project;
  let created = false;

  if (existing) {
    project = await prisma.jiraProject.update({
      where: { key: cleanKey },
      data: {
        name: name || existing.name,
        jiraId: input.jiraId !== undefined ? input.jiraId : existing.jiraId,
        active: true,
        // syncEnabled is admin-controlled: re-adding a project must not
        // silently resume a sync an admin turned off.
        lastValidatedAt: now,
        lastValidationCode: input.lastValidationCode ?? existing.lastValidationCode,
        ...(input.bootstrapState ? { bootstrapState: input.bootstrapState } : {}),
      },
      select: {
        key: true,
        name: true,
        active: true,
        syncEnabled: true,
        bootstrapState: true,
        lastBootstrapAt: true,
        lastBootstrapError: true,
        source: true,
      },
    });
  } else {
    created = true;
    project = await prisma.jiraProject.create({
      data: {
        key: cleanKey,
        name: name || cleanKey,
        jiraId: input.jiraId ?? null,
        active: true,
        syncEnabled: true,
        source,
        discoveredById: input.discoveredById ?? null,
        lastValidatedAt: now,
        lastValidationCode: input.lastValidationCode ?? null,
        bootstrapState: input.bootstrapState ?? "ready",
        lastBootstrapAt: now,
      },
      select: {
        key: true,
        name: true,
        active: true,
        syncEnabled: true,
        bootstrapState: true,
        lastBootstrapAt: true,
        lastBootstrapError: true,
        source: true,
      },
    });
  }

  console.info(
    JSON.stringify({
      event: "jira_project_registered",
      projectKey: cleanKey,
      source,
      created,
    })
  );

  return project;
}

/**
 * Update bootstrap state and optional error for a project.
 */
export async function updateProjectBootstrapState(
  key: string,
  state: string,
  error?: string | null
): Promise<void> {
  const cleanKey = normalizeProjectKey(key);
  try {
    await prisma.jiraProject.update({
      where: { key: cleanKey },
      data: {
        bootstrapState: state,
        lastBootstrapAt: new Date(),
        lastBootstrapError: error ?? null,
      },
    });
  } catch {
    // Non-critical update
  }
}

/**
 * Archive a project (soft deactivate, stops scheduled sync and hides from active picker).
 */
export async function archiveProject(key: string): Promise<void> {
  const cleanKey = normalizeProjectKey(key);
  if (!cleanKey) return;

  await prisma.jiraProject.update({
    where: { key: cleanKey },
    data: {
      active: false,
      syncEnabled: false,
    },
  });
}
