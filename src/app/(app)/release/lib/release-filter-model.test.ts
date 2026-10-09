import { describe, it, expect } from "vitest";
import { filterReleases, extractDistinctProjects } from "./release-filter-model";
import type { ReleaseCardItem } from "../release-card";

describe("release-filter-model", () => {
  const sampleReleases: ReleaseCardItem[] = [
    {
      id: "r1",
      projectKey: "EPM",
      version: "v1.0.0",
      description: "Initial production launch",
      archived: false,
      readiness: "ready",
      tasks: [{ jiraKey: "EPM-10", summary: "Setup DB" }],
    } as unknown as ReleaseCardItem,
    {
      id: "r2",
      projectKey: "CICM",
      version: "v2.1.0",
      description: "Bugfixes",
      archived: false,
      readiness: "in_progress",
      tasks: [{ jiraKey: "CICM-55", summary: "Fix memory leak" }],
    } as unknown as ReleaseCardItem,
    {
      id: "r3",
      projectKey: "EPM",
      version: "v0.9.0",
      description: "Legacy alpha",
      archived: true,
      readiness: "released",
      tasks: [],
    } as unknown as ReleaseCardItem,
  ];

  it("filters releases by KPI readiness group", () => {
    const ready = filterReleases(sampleReleases, "ready", "");
    expect(ready).toHaveLength(1);
    expect(ready[0].version).toBe("v1.0.0");

    const inProgress = filterReleases(sampleReleases, "in_progress", "");
    expect(inProgress).toHaveLength(1);
    expect(inProgress[0].version).toBe("v2.1.0");

    const archived = filterReleases(sampleReleases, "archived", "");
    expect(archived).toHaveLength(1);
    expect(archived[0].version).toBe("v0.9.0");
  });

  it("filters releases by search query across version, project, desc, and tasks", () => {
    expect(filterReleases(sampleReleases, "all", "leak")).toHaveLength(1);
    expect(filterReleases(sampleReleases, "all", "CICM-55")).toHaveLength(1);
    expect(filterReleases(sampleReleases, "all", "EPM")).toHaveLength(1); // non-archived EPM
    expect(filterReleases(sampleReleases, "all", "nonexistent")).toHaveLength(0);
  });

  it("extracts distinct sorted project list", () => {
    const projects = [{ key: "MR" }, { key: "EPM" }];
    const list = extractDistinctProjects(projects, sampleReleases);
    expect(list).toEqual(["CICM", "EPM", "MR"]);
  });
});
