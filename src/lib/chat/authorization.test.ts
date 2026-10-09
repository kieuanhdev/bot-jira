import { describe, it, expect, vi } from "vitest";
import {
  isBlockedError,
  blocksToText,
  issueLink,
  hasRole,
  checkReleasePermission,
} from "./authorization";
import { JiraRequestError } from "@/lib/jira/client";
import type { ChatBlock } from "./index";
import type { ExecContext } from "./types";

vi.mock("@/lib/env", () => ({
  env: { publicBaseUrl: "https://tasks.example.com" },
}));

describe("authorization — isBlockedError", () => {
  it("recognizes JiraRequestError 403 as blocked", () => {
    const err = new JiraRequestError("Forbidden", 403, false);
    expect(isBlockedError(err)).toBe(true);
  });

  it("recognizes JiraRequestError 401 as blocked", () => {
    const err = new JiraRequestError("Unauthorized", 401, false);
    expect(isBlockedError(err)).toBe(true);
  });

  it("returns false for JiraRequestError 404 or 500", () => {
    expect(isBlockedError(new JiraRequestError("Not found", 404, false))).toBe(false);
    expect(isBlockedError(new JiraRequestError("Internal server error", 500, true))).toBe(false);
  });

  it("recognizes Error message matching forbidden/permission/not allowed", () => {
    expect(isBlockedError(new Error("You do not have permission to transition this issue"))).toBe(true);
    expect(isBlockedError(new Error("Operation forbidden by project security"))).toBe(true);
    expect(isBlockedError(new Error("Action not allowed for user"))).toBe(true);
    expect(isBlockedError(new Error("HTTP 403 response"))).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isBlockedError(new Error("Network timeout after 10000ms"))).toBe(false);
    expect(isBlockedError("generic string error")).toBe(false);
    expect(isBlockedError(null)).toBe(false);
    expect(isBlockedError(undefined)).toBe(false);
  });
});

describe("authorization — blocksToText", () => {
  it("formats text, fields, and link blocks into plain text", () => {
    const blocks: ChatBlock[] = [
      { kind: "text", text: "Summary header" },
      {
        kind: "fields",
        fields: [
          { label: "Status", value: "Done" },
          { label: "Assignee", value: "Alice" },
        ],
      },
      { kind: "divider" },
      { kind: "link", label: "Open issue", url: "https://tasks.example.com/issue/PROJ-1" },
    ];

    const result = blocksToText(blocks);
    expect(result).toBe(
      "Summary header\nStatus: Done  Assignee: Alice\nOpen issue https://tasks.example.com/issue/PROJ-1"
    );
  });

  it("returns empty string when blocks list is empty", () => {
    expect(blocksToText([])).toBe("");
  });
});

describe("authorization — issueLink", () => {
  it("constructs link to issue using publicBaseUrl", () => {
    expect(issueLink("PROJ-999")).toBe("https://tasks.example.com/issue/PROJ-999");
  });
});

describe("authorization — hasRole and checkReleasePermission", () => {
  const baseCtx: ExecContext = {
    userId: "u-1",
    jiraAuth: { user: "alice", token: "tok", authMode: "Bearer" },
    jiraUsername: "alice",
    role: "member",
    provider: "discord",
    externalAuthorId: "ext-1",
  };

  it("checks whether context role is in allowed list", () => {
    expect(hasRole(baseCtx, ["admin", "release_manager"])).toBe(false);
    expect(hasRole({ ...baseCtx, role: "admin" }, ["admin", "release_manager"])).toBe(true);
    expect(hasRole({ ...baseCtx, role: "release_manager" }, ["admin", "release_manager"])).toBe(true);
  });

  it("blocks non-admin and non-release_manager from running /release", () => {
    const blocked = checkReleasePermission(baseCtx);
    expect(blocked).toEqual({
      status: "blocked",
      blocks: [{ kind: "text", text: "Only release_manager or admin can run /release." }],
      text: "Only release_manager or admin can run /release.",
    });
  });

  it("allows admin and release_manager through checkReleasePermission", () => {
    expect(checkReleasePermission({ ...baseCtx, role: "admin" })).toBeNull();
    expect(checkReleasePermission({ ...baseCtx, role: "release_manager" })).toBeNull();
  });
});
