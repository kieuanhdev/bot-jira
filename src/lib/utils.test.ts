import { describe, it, expect } from "vitest";
import { getJiraIssueUrl, getBitbucketBranchUrl } from "./utils";

describe("getJiraIssueUrl", () => {
  it("returns null if baseUrl or key is missing", () => {
    expect(getJiraIssueUrl(null, "EPM-123")).toBeNull();
    expect(getJiraIssueUrl("", "EPM-123")).toBeNull();
    expect(getJiraIssueUrl("https://jira.example.com", null)).toBeNull();
    expect(getJiraIssueUrl("https://jira.example.com", "")).toBeNull();
  });

  it("builds correct issue browse url without trailing slashes", () => {
    expect(getJiraIssueUrl("https://jira.example.com/", "EPM-123")).toBe(
      "https://jira.example.com/browse/EPM-123"
    );
    expect(getJiraIssueUrl("https://jira.example.com", "EPM-456")).toBe(
      "https://jira.example.com/browse/EPM-456"
    );
  });
});

describe("getBitbucketBranchUrl", () => {
  it("derives branch URL from prUrl when available", () => {
    const prUrl = "https://bitbucket.company.com/projects/PROJ/repos/my-repo/pull-requests/42";
    expect(getBitbucketBranchUrl("PROJ/my-repo", "feature/abc", null, prUrl)).toBe(
      "https://bitbucket.company.com/projects/PROJ/repos/my-repo/browse?at=refs%2Fheads%2Ffeature%2Fabc"
    );
  });

  it("builds branch URL from bitbucketBaseUrl and repo slug", () => {
    const baseUrl = "https://bitbucket.company.com";
    expect(getBitbucketBranchUrl("PROJ/my-repo", "feature/abc", baseUrl)).toBe(
      "https://bitbucket.company.com/projects/PROJ/repos/my-repo/browse?at=refs%2Fheads%2Ffeature%2Fabc"
    );
  });

  it("handles repo without project prefix by defaulting project to repo", () => {
    const baseUrl = "https://bitbucket.company.com";
    expect(getBitbucketBranchUrl("standalone-repo", "main", baseUrl)).toBe(
      "https://bitbucket.company.com/projects/standalone-repo/repos/standalone-repo/browse?at=refs%2Fheads%2Fmain"
    );
  });

  it("returns null when neither bitbucketBaseUrl nor prUrl is available", () => {
    expect(getBitbucketBranchUrl("PROJ/my-repo", "feature/abc", null, null)).toBeNull();
  });
});
