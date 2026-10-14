import { prisma } from "@/lib/prisma";
import { normalizeProjectKey } from "./project-catalog";
import { resolveSyncFeatures, type SyncFeature } from "./sync-features-shared";

// Pure definitions live in ./sync-features-shared so client components can
// import them without pulling Prisma/pg into the browser bundle.
export * from "./sync-features-shared";

export interface SyncPolicy {
  isEnabled(projectKey: string, feature: SyncFeature): boolean;
  disabledKeys(feature: SyncFeature): string[];
  getFeatures(projectKey: string): Record<SyncFeature, boolean>;
}

class StaticSyncPolicy implements SyncPolicy {
  private projectMap: Map<
    string,
    { active: boolean; syncEnabled: boolean; features: Record<SyncFeature, boolean> }
  >;

  constructor(
    records: Array<{
      key: string;
      active: boolean;
      syncEnabled: boolean;
      syncFeatures: unknown;
    }>
  ) {
    this.projectMap = new Map();
    for (const r of records) {
      const cleanKey = normalizeProjectKey(r.key);
      this.projectMap.set(cleanKey, {
        active: r.active,
        syncEnabled: r.syncEnabled,
        features: resolveSyncFeatures(r.syncFeatures),
      });
    }
  }

  isEnabled(projectKey: string, feature: SyncFeature): boolean {
    const cleanKey = normalizeProjectKey(projectKey);
    const entry = this.projectMap.get(cleanKey);
    // Project not in catalog -> treat as enabled (graceful fallback)
    if (!entry) return true;
    // Master switch off -> all features disabled
    if (!entry.active || !entry.syncEnabled) return false;
    return entry.features[feature] ?? true;
  }

  disabledKeys(feature: SyncFeature): string[] {
    const disabled: string[] = [];
    for (const [key, entry] of this.projectMap.entries()) {
      if (!entry.active || !entry.syncEnabled || !entry.features[feature]) {
        disabled.push(key);
      }
    }
    return disabled;
  }

  getFeatures(projectKey: string): Record<SyncFeature, boolean> {
    const cleanKey = normalizeProjectKey(projectKey);
    const entry = this.projectMap.get(cleanKey);
    if (!entry) return resolveSyncFeatures(null);
    return { ...entry.features };
  }
}

/** Fallback policy when DB is unavailable: everything enabled. */
class FallbackSyncPolicy implements SyncPolicy {
  isEnabled(): boolean {
    return true;
  }
  disabledKeys(): string[] {
    return [];
  }
  getFeatures(): Record<SyncFeature, boolean> {
    return resolveSyncFeatures(null);
  }
}

/**
 * Load sync policy once per worker job or request.
 * On DB failure, returns a policy where every project and feature is enabled.
 */
export async function loadSyncPolicy(): Promise<SyncPolicy> {
  try {
    const projects = await prisma.jiraProject.findMany({
      select: {
        key: true,
        active: true,
        syncEnabled: true,
        syncFeatures: true,
      },
    });
    return new StaticSyncPolicy(projects);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "jira_sync_policy_load_failed",
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return new FallbackSyncPolicy();
  }
}
