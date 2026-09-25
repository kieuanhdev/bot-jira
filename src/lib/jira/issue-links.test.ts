import { describe, it, expect } from "vitest";
import { normalizeIssueLink, isDependencyLinkType } from "./issue-links";
import type { JiraIssueLink } from "./types";

describe("issue-links normalizer (DEP-02)", () => {
  it("recognizes Blocks link type by name, inward, or outward label", () => {
    expect(isDependencyLinkType({ name: "Blocks", inward: "is blocked by", outward: "blocks" })).toBe(true);
    expect(isDependencyLinkType({ name: "blocks", inward: "custom", outward: "custom" })).toBe(true);
    expect(isDependencyLinkType({ name: "Dependency", inward: "is blocked by", outward: "blocks" })).toBe(true);
    expect(isDependencyLinkType({ name: "Relates", inward: "relates to", outward: "relates to" })).toBe(false);
    expect(isDependencyLinkType({ name: "Duplicate", inward: "is duplicated by", outward: "duplicates" })).toBe(false);
    expect(isDependencyLinkType({ name: "Cloners", inward: "is cloned by", outward: "clones" })).toBe(false);
  });

  it("normalizes link with inwardIssue: A is blocked by B => outwardKey: B, inwardKey: A", () => {
    // When viewing A, Jira returns inwardIssue = B
    const link: JiraIssueLink = {
      id: "10001",
      type: {
        id: "100",
        name: "Blocks",
        inward: "is blocked by",
        outward: "blocks",
      },
      inwardIssue: {
        id: "20002",
        key: "PROJ-200",
      },
    };

    const normalized = normalizeIssueLink("PROJ-100", link);
    expect(normalized).toEqual({
      jiraLinkId: "10001",
      linkTypeId: "100",
      linkTypeName: "Blocks",
      inwardLabel: "is blocked by",
      outwardLabel: "blocks",
      outwardKey: "PROJ-200", // Dependency
      inwardKey: "PROJ-100",  // Large task
    });
  });

  it("normalizes link with outwardIssue: B blocks A => outwardKey: B, inwardKey: A", () => {
    // When viewing B, Jira returns outwardIssue = A
    const link: JiraIssueLink = {
      id: "10001",
      type: {
        id: "100",
        name: "Blocks",
        inward: "is blocked by",
        outward: "blocks",
      },
      outwardIssue: {
        id: "20001",
        key: "PROJ-100",
      },
    };

    const normalized = normalizeIssueLink("PROJ-200", link);
    expect(normalized).toEqual({
      jiraLinkId: "10001",
      linkTypeId: "100",
      linkTypeName: "Blocks",
      inwardLabel: "is blocked by",
      outwardLabel: "blocks",
      outwardKey: "PROJ-200", // Dependency
      inwardKey: "PROJ-100",  // Large task
    });
  });

  it("rejects non-dependency link types like 'Relates'", () => {
    const link: JiraIssueLink = {
      id: "10002",
      type: {
        id: "101",
        name: "Relates",
        inward: "relates to",
        outward: "relates to",
      },
      inwardIssue: {
        id: "20003",
        key: "PROJ-300",
      },
    };

    expect(normalizeIssueLink("PROJ-100", link)).toBeNull();
  });

  it("rejects self links", () => {
    const link: JiraIssueLink = {
      id: "10003",
      type: {
        id: "100",
        name: "Blocks",
        inward: "is blocked by",
        outward: "blocks",
      },
      inwardIssue: {
        id: "20001",
        key: "PROJ-100",
      },
    };

    expect(normalizeIssueLink("PROJ-100", link)).toBeNull();
  });
});
