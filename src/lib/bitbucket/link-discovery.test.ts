import { describe, it, expect } from "vitest";
import {
  isManualLinkSource,
  isProtectedBranchLinkState,
  getLinkSourcePriority,
  rankConfirmedLinks,
  selectPrimaryLink,
  selectPrimaryLinkObject,
  discoverBranchLinks,
  type LinkCandidate,
} from "./link-discovery";

describe("link-discovery: sources and priorities", () => {
  it("classifies manual and explicit sources as manual", () => {
    expect(isManualLinkSource("manual")).toBe(true);
    expect(isManualLinkSource("explicit")).toBe(true);
    expect(isManualLinkSource("branch_name")).toBe(false);
    expect(isManualLinkSource("pr_title")).toBe(false);
    expect(isManualLinkSource("commit_message")).toBe(false);
    expect(isManualLinkSource("jira_dev_status")).toBe(false);
    expect(isManualLinkSource(null)).toBe(false);
    expect(isManualLinkSource(undefined)).toBe(false);
  });

  it("identifies protected branch link states", () => {
    expect(isProtectedBranchLinkState("manual_unlinked")).toBe(true);
    expect(isProtectedBranchLinkState("rejected")).toBe(true);
    expect(isProtectedBranchLinkState("confirmed")).toBe(false);
    expect(isProtectedBranchLinkState("suggested")).toBe(false);
    expect(isProtectedBranchLinkState("unlinked")).toBe(false);
    expect(isProtectedBranchLinkState(null)).toBe(false);
  });

  it("returns calibrated priority numbers for each standard source", () => {
    expect(getLinkSourcePriority("manual")).toBe(100);
    expect(getLinkSourcePriority("explicit")).toBe(100);
    expect(getLinkSourcePriority("jira_dev_status")).toBe(80);
    expect(getLinkSourcePriority("branch_name")).toBe(60);
    expect(getLinkSourcePriority("commit_message")).toBe(50);
    expect(getLinkSourcePriority("pr_title")).toBe(40);
    expect(getLinkSourcePriority("comment")).toBe(20);
    expect(getLinkSourcePriority("unknown")).toBe(10);
    expect(getLinkSourcePriority(null)).toBe(0);
  });
});

describe("link-discovery: rankConfirmedLinks", () => {
  it("ranks manual link ahead of auto link even if auto link has higher nominal confidence", () => {
    const links: LinkCandidate[] = [
      { jiraKey: "AUTO-1", linkSource: "branch_name", linkConfidence: 95 },
      { jiraKey: "MANUAL-1", linkSource: "manual", linkConfidence: 90 },
    ];
    const ranked = rankConfirmedLinks(links);
    expect(ranked[0].jiraKey).toBe("MANUAL-1");
    expect(ranked[1].jiraKey).toBe("AUTO-1");
  });

  it("ranks higher confidence ahead within same manual tier", () => {
    const links: LinkCandidate[] = [
      { jiraKey: "AUTO-LOW", linkSource: "pr_title", linkConfidence: 85 },
      { jiraKey: "AUTO-HIGH", linkSource: "branch_name", linkConfidence: 95 },
    ];
    const ranked = rankConfirmedLinks(links);
    expect(ranked[0].jiraKey).toBe("AUTO-HIGH");
    expect(ranked[1].jiraKey).toBe("AUTO-LOW");
  });

  it("breaks confidence ties with link source priority", () => {
    const links: LinkCandidate[] = [
      { jiraKey: "PR-1", linkSource: "pr_title", linkConfidence: 85 },
      { jiraKey: "DEV-1", linkSource: "jira_dev_status", linkConfidence: 85 },
    ];
    const ranked = rankConfirmedLinks(links);
    expect(ranked[0].jiraKey).toBe("DEV-1");
    expect(ranked[1].jiraKey).toBe("PR-1");
  });

  it("breaks identical ties with createdAt ascending (earliest created wins)", () => {
    const date1 = new Date("2026-01-01T00:00:00Z");
    const date2 = new Date("2026-01-02T00:00:00Z");
    const links: LinkCandidate[] = [
      { jiraKey: "LATER", linkSource: "branch_name", linkConfidence: 95, createdAt: date2 },
      { jiraKey: "EARLIER", linkSource: "branch_name", linkConfidence: 95, createdAt: date1 },
    ];
    const ranked = rankConfirmedLinks(links);
    expect(ranked[0].jiraKey).toBe("EARLIER");
    expect(ranked[1].jiraKey).toBe("LATER");
  });
});

describe("link-discovery: selectPrimaryLink", () => {
  it("returns null for empty links array", () => {
    expect(selectPrimaryLink([])).toBeNull();
    expect(selectPrimaryLinkObject([])).toBeNull();
  });

  it("selects top candidate when no current primary is set", () => {
    const links: LinkCandidate[] = [
      { jiraKey: "EPM-1", linkSource: "branch_name", linkConfidence: 95 },
      { jiraKey: "EPM-2", linkSource: "pr_title", linkConfidence: 85 },
    ];
    expect(selectPrimaryLink(links)).toBe("EPM-1");
    expect(selectPrimaryLinkObject(links)?.jiraKey).toBe("EPM-1");
  });

  it("maintains stability: keeps current primary if it is tied for top rank", () => {
    const links: LinkCandidate[] = [
      { jiraKey: "EPM-1", linkSource: "branch_name", linkConfidence: 95 },
      { jiraKey: "EPM-2", linkSource: "branch_name", linkConfidence: 95 },
    ];
    // If current primary was EPM-2, stability rule keeps EPM-2
    expect(selectPrimaryLink(links, "EPM-2")).toBe("EPM-2");
    // If current primary was EPM-1, stability rule keeps EPM-1
    expect(selectPrimaryLink(links, "EPM-1")).toBe("EPM-1");
  });

  it("overrides current primary if a strictly higher rank candidate is added", () => {
    const links: LinkCandidate[] = [
      { jiraKey: "AUTO-1", linkSource: "branch_name", linkConfidence: 95 },
      { jiraKey: "MANUAL-1", linkSource: "manual", linkConfidence: 100 },
    ];
    // Even though current was AUTO-1, MANUAL-1 is higher tier
    expect(selectPrimaryLink(links, "AUTO-1")).toBe("MANUAL-1");
  });

  it("overrides current primary if current has lower confidence", () => {
    const links: LinkCandidate[] = [
      { jiraKey: "AUTO-LOW", linkSource: "pr_title", linkConfidence: 85 },
      { jiraKey: "AUTO-HIGH", linkSource: "branch_name", linkConfidence: 95 },
    ];
    expect(selectPrimaryLink(links, "AUTO-LOW")).toBe("AUTO-HIGH");
  });

  it("falls back to top candidate when current primary was unlinked / is not in list", () => {
    const links: LinkCandidate[] = [
      { jiraKey: "EPM-2", linkSource: "branch_name", linkConfidence: 95 },
    ];
    expect(selectPrimaryLink(links, "EPM-UNLINKED")).toBe("EPM-2");
  });
});

describe("link-discovery: discoverBranchLinks", () => {
  const validKeys = new Set(["EPM-101", "EPM-102", "EPM-103", "EPM-104", "EPM-105", "EPM-106"]);

  it("extracts candidate from branch name", () => {
    const candidates = discoverBranchLinks({
      branch: "feature/EPM-101-payment",
      validKeys,
    });
    expect(candidates).toEqual([
      {
        jiraKey: "EPM-101",
        source: "branch_name",
        confidence: 95,
        reason: "Found in branch name: feature/EPM-101-payment",
      },
    ]);
  });

  it("deduplicates keys between branch name and PR title", () => {
    const candidates = discoverBranchLinks({
      branch: "feature/EPM-101-auth",
      prTitle: "EPM-101: Fix authentication token",
      validKeys,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].jiraKey).toBe("EPM-101");
    expect(candidates[0].source).toBe("branch_name");
  });

  it("discovers multiple unique keys from branch name and PR title", () => {
    const candidates = discoverBranchLinks({
      branch: "feature/EPM-101-EPM-102-migration",
      prTitle: "EPM-103: Update database schema",
      validKeys,
    });
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.jiraKey)).toEqual(["EPM-101", "EPM-102", "EPM-103"]);
    expect(candidates[0].source).toBe("branch_name");
    expect(candidates[1].source).toBe("branch_name");
    expect(candidates[2].source).toBe("pr_title");
  });

  it("discovers keys from commit messages when branch and PR lack them", () => {
    const candidates = discoverBranchLinks({
      branch: "fix/quick-patch",
      prTitle: "Minor adjustments",
      commitMessages: ["commit 1", "EPM-104: bugfix in handler"],
      validKeys,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].jiraKey).toBe("EPM-104");
    expect(candidates[0].source).toBe("commit_message");
  });

  it("includes resolvedPrimary if confirmed and not yet in list", () => {
    const candidates = discoverBranchLinks({
      branch: "random-branch-name",
      resolvedPrimary: {
        jiraKey: "EPM-105",
        linkSource: "jira_dev_status",
        linkConfidence: 100,
        linkState: "confirmed",
      },
      validKeys,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].jiraKey).toBe("EPM-105");
    expect(candidates[0].source).toBe("jira_dev_status");
  });

  it("filters out keys not in validKeys set", () => {
    const candidates = discoverBranchLinks({
      branch: "feature/EPM-101-and-NOTVALID-999",
      prTitle: "Fix NOTVALID-888",
      validKeys,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].jiraKey).toBe("EPM-101");
  });

  it("enforces maxLinks limit (default 5)", () => {
    const candidates = discoverBranchLinks({
      branch: "feature/EPM-101-EPM-102-EPM-103-EPM-104-EPM-105-EPM-106",
      validKeys,
    });
    expect(candidates).toHaveLength(5);
    expect(candidates.map((c) => c.jiraKey)).toEqual([
      "EPM-101",
      "EPM-102",
      "EPM-103",
      "EPM-104",
      "EPM-105",
    ]);
  });

  it("filters out false positive prefixes like FIX, HOTFIX, RELEASE", () => {
    const candidates = discoverBranchLinks({
      branch: "hot-fix-5.9.2-release-4.8.1-EPM-101",
      validKeys,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].jiraKey).toBe("EPM-101");
  });
});
