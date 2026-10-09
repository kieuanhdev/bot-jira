import { describe, it, expect } from "vitest";
import {
  parseBranchFilters,
  buildBranchFilterParams,
  buildTaskQueryUrl,
  buildBranchQueryUrl,
  toBranchRowItem,
} from "./branches-filter-model";
import { DEFAULT_FILTERS } from "../branch-types";

describe("branches-filter-model", () => {
  it("parses defaults when query params are empty", () => {
    const params = new URLSearchParams();
    const parsed = parseBranchFilters(params);
    expect(parsed.view).toBe(DEFAULT_FILTERS.view);
    expect(parsed.project).toBe(DEFAULT_FILTERS.project);
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });

  it("parses custom filters accurately", () => {
    const params = new URLSearchParams({
      view: "all-branches",
      q: "feat/auth",
      project: "PROJ",
      repo: "web-ui",
      page: "3",
      pageSize: "50",
    });
    const parsed = parseBranchFilters(params);
    expect(parsed.view).toBe("all-branches");
    expect(parsed.q).toBe("feat/auth");
    expect(parsed.project).toBe("PROJ");
    expect(parsed.repo).toBe("web-ui");
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });

  it("builds URLSearchParams omitting default values", () => {
    const filters = {
      ...DEFAULT_FILTERS,
      project: "EPM",
      page: 2,
    };
    const params = buildBranchFilterParams(filters);
    expect(params.get("project")).toBe("EPM");
    expect(params.get("page")).toBe("2");
    expect(params.has("view")).toBe(false);
    expect(params.has("repo")).toBe(false);
  });

  it("builds query URLs for task delivery and technical branch views", () => {
    const filters = {
      ...DEFAULT_FILTERS,
      q: "ticket-101",
      project: "CICM",
    };
    const taskUrl = buildTaskQueryUrl(filters);
    expect(taskUrl).toContain("/api/branches/tasks?");
    expect(taskUrl).toContain("project=CICM");
    expect(taskUrl).toContain("q=ticket-101");

    const branchUrl = buildBranchQueryUrl(filters);
    expect(branchUrl).toContain("/api/branches?");
    expect(branchUrl).toContain("project=CICM");
    expect(branchUrl).toContain("q=ticket-101");
  });

  it("maps minimal branch payload to full BranchRowItem", () => {
    const row = toBranchRowItem({
      id: "br-1",
      repo: "my-repo",
      branch: "feature/login",
      suggestedJiraKey: "CICM-42",
      jiraKey: null,
      prTitle: "Add login",
      prUrl: "https://bitbucket.org/pr/1",
    });
    expect(row.id).toBe("br-1");
    expect(row.repo).toBe("my-repo");
    expect(row.branch).toBe("feature/login");
    expect(row.suggestedJiraKey).toBe("CICM-42");
    expect(row.jiraKey).toBeNull();
    expect(row.prTitle).toBe("Add login");
    expect(row.merged).toBe(false);
  });
});
