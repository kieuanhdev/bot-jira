import { scopeProjectItems } from "@/lib/project-scope-client";
import type { ReleaseCardItem } from "../release-card";

export function extractDistinctProjects(
  projects: Array<{ key: string; selected?: boolean }> = [],
  releases: ReleaseCardItem[] = []
): string[] {
  const set = new Set<string>();
  scopeProjectItems(projects).forEach((p) => set.add(p.key));
  releases.forEach((r) => {
    if (r.projectKey) set.add(r.projectKey);
  });
  return Array.from(set).sort();
}

export function filterReleases(
  releases: ReleaseCardItem[],
  selectedFilter: string,
  searchQuery: string
): ReleaseCardItem[] {
  return releases.filter((r) => {
    // 1. KPI filter
    if (selectedFilter === "archived") {
      if (!r.archived) return false;
    } else {
      if (r.archived) return false;

      if (selectedFilter === "in_progress") {
        if (r.readiness !== "in_progress") return false;
      } else if (selectedFilter === "ready") {
        if (r.readiness !== "ready") return false;
      } else if (selectedFilter === "empty") {
        if (r.readiness !== "empty") return false;
      } else if (selectedFilter === "released") {
        if (r.readiness !== "released") return false;
      }
    }

    // 2. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesVersion = r.version.toLowerCase().includes(q);
      const matchesProject = r.projectKey.toLowerCase().includes(q);
      const matchesDesc = (r.description || "").toLowerCase().includes(q);
      const matchesTask = r.tasks.some(
        (t) => t.jiraKey.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q)
      );
      return matchesVersion || matchesProject || matchesDesc || matchesTask;
    }

    return true;
  });
}
