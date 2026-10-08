import { env, jiraProjectList } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { safeDecrypt } from "@/lib/crypto";
import { getSystemJiraAuth, jiraWith, type JiraAuth } from "./client";
import { registerVerifiedProject } from "./project-catalog";

/**
 * Per-project Jira credentials.
 *
 * Several accounts can be stored (the system token plus every user who saved a
 * Jira token) and each sees a different set of projects. Instead of syncing
 * everything with one account, every project is synced with the first stored
 * account that can actually read it.
 */

const TTL_MS = 30 * 60 * 1000;

type Cred = { label: string; auth: JiraAuth };

let accessCache: { at: number; byProject: Map<string, Cred> } | null = null;

function sameAuth(a: JiraAuth, b: JiraAuth): boolean {
  return a.user === b.user && a.token === b.token;
}

/** System account first, then every stored user account, de-duplicated. */
export async function listJiraCreds(): Promise<Cred[]> {
  const out: Cred[] = [];
  const add = (label: string, auth: JiraAuth | null) => {
    if (auth && !out.some((c) => sameAuth(c.auth, auth))) out.push({ label, auth });
  };

  add("system", await getSystemJiraAuth().catch(() => null));

  try {
    const users = await prisma.user.findMany({
      where: { jiraTokenEnc: { not: null } },
      orderBy: [{ role: "asc" }, { updatedAt: "desc" }],
      select: { jiraUsername: true, jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
    });
    for (const u of users) {
      const token = safeDecrypt(u.jiraTokenEnc);
      if (!token) continue;
      const user = u.jiraUsername || safeDecrypt(u.jiraUserEnc) || "";
      const authMode = (u.jiraAuth || "Bearer").toLowerCase() === "basic" ? "basic" : "Bearer";
      add(user || "user", { user, token, authMode });
    }
  } catch {
    // DB unavailable: system credential only.
  }
  return out;
}

/**
 * Ask every stored account which projects it can see. Failures of one account
 * (expired token, 401) never hide projects another account can see.
 * The first account that sees a project is the one used to sync it.
 */
export async function discoverJiraProjectAccess(
  force = false
): Promise<Map<string, Cred & { name?: string; id?: string }>> {
  if (!force && accessCache && Date.now() - accessCache.at < TTL_MS) {
    return accessCache.byProject as Map<string, Cred & { name?: string; id?: string }>;
  }
  const byProject = new Map<string, Cred & { name?: string; id?: string }>();
  for (const cred of await listJiraCreds()) {
    try {
      const projects = await jiraWith(cred.auth).getProjects();
      for (const p of projects) {
        const key = p.key.toUpperCase();
        if (!byProject.has(key)) byProject.set(key, { ...cred, name: p.name, id: p.id });
      }
    } catch {
      // This account is unusable right now; try the next one.
    }
  }
  accessCache = { at: Date.now(), byProject };
  return byProject;
}

/**
 * Credential to sync `projectKey` with: the first stored account that can read
 * it, or the system account (previous behaviour) when none can.
 */
export async function resolveJiraAuthForProject(projectKey: string): Promise<JiraAuth | null> {
  const key = projectKey.toUpperCase();
  if (!env.jiraAutoDiscover) return getSystemJiraAuth();
  const access = await discoverJiraProjectAccess().catch(() => null);
  return access?.get(key)?.auth ?? (await getSystemJiraAuth());
}

/**
 * Projects listed in JIRA_PROJECT_KEYS that some stored account can read but
 * that are missing from the catalog get registered so they start syncing.
 * Only configured keys are auto-added, never every project an account can see.
 */
export async function registerAccessibleConfiguredProjects(): Promise<string[]> {
  if (!env.jiraAutoDiscover) return [];
  const access = await discoverJiraProjectAccess();
  const existing = new Set(
    (await prisma.jiraProject.findMany({ select: { key: true } })).map((p) => p.key.toUpperCase())
  );
  const added: string[] = [];
  for (const key of jiraProjectList) {
    if (existing.has(key)) continue;
    const found = access.get(key);
    if (!found) continue;
    await registerVerifiedProject({
      key,
      name: found.name || key,
      jiraId: found.id ?? null,
      source: "bootstrap",
      bootstrapState: "syncing_issues",
    });
    added.push(key);
  }
  return added;
}

/** Test helper. */
export function resetJiraAccessCache(): void {
  accessCache = null;
}
