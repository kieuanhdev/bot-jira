import { describe, it, expect } from "vitest";
import { parseCommentForBranch } from "./parse-comments";

describe("parseCommentForBranch", () => {
  it("parses a merged PR comment", () => {
    const result = parseCommentForBranch(
      "Merged pull request #123 from EPM-123 to main",
      "EPM-123"
    );
    expect(result).not.toBeNull();
    expect(result!.jiraKey).toBe("EPM-123");
    expect(result!.branch).toBe("EPM-123");
    expect(result!.prId).toBe(123);
    expect(result!.prState).toBe("MERGED");
    expect(result!.destinationBranch).toBe("main");
  });

  it("parses a created PR comment", () => {
    const result = parseCommentForBranch(
      "Created pull request #124: EPM-124 fix login",
      "EPM-124"
    );
    expect(result).not.toBeNull();
    expect(result!.prId).toBe(124);
    expect(result!.prState).toBe("OPEN");
  });

  it("parses a declined PR comment", () => {
    const result = parseCommentForBranch(
      "Declined pull request #125 from EPM-125-fix to main",
      "EPM-125"
    );
    expect(result).not.toBeNull();
    expect(result!.prId).toBe(125);
    expect(result!.prState).toBe("DECLINED");
    expect(result!.branch).toBe("EPM-125-fix");
    expect(result!.destinationBranch).toBe("main");
  });

  it("parses a closed PR comment", () => {
    const result = parseCommentForBranch(
      "Closed pull request #126",
      "EPM-126"
    );
    expect(result).not.toBeNull();
    expect(result!.prState).toBe("CLOSED");
  });

  it("parses an updated PR comment as OPEN", () => {
    const result = parseCommentForBranch(
      "Updated pull request #127 from EPM-127",
      "EPM-127"
    );
    expect(result).not.toBeNull();
    expect(result!.prState).toBe("OPEN");
  });

  it("parses 'merged into' format", () => {
    const result = parseCommentForBranch(
      "Pull request #128 was merged into develop",
      "EPM-128"
    );
    expect(result).not.toBeNull();
    expect(result!.prState).toBe("MERGED");
    expect(result!.destinationBranch).toBe("develop");
  });

  it("returns null for non-PR comments", () => {
    expect(parseCommentForBranch("Just a regular comment", "EPM-1")).toBeNull();
    expect(parseCommentForBranch("", "EPM-1")).toBeNull();
    expect(parseCommentForBranch("Fix the bug", "EPM-1")).toBeNull();
  });

  it("handles PR with branch name containing suffix", () => {
    const result = parseCommentForBranch(
      "Merged pull request #200 from EPM-200-hotfix to release-1.2",
      "EPM-200"
    );
    expect(result).not.toBeNull();
    expect(result!.branch).toBe("EPM-200-hotfix");
    expect(result!.prState).toBe("MERGED");
    expect(result!.destinationBranch).toBe("release-1.2");
  });

  it("returns OPEN when PR id present but no state verb", () => {
    const result = parseCommentForBranch(
      "See pull request #300 for details",
      "EPM-300"
    );
    expect(result).not.toBeNull();
    expect(result!.prState).toBe("OPEN");
  });

  it("does not match unrelated issue keys", () => {
    // Comment about a different issue's PR
    const result = parseCommentForBranch(
      "Merged pull request #50 from CICM-50 to main",
      "EPM-1"
    );
    // Branch is CICM-50, not EPM-1 — still parsed but jiraKey is EPM-1
    expect(result).not.toBeNull();
    expect(result!.branch).toBe("CICM-50");
  });
});
