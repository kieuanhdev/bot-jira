import { describe, it, expect } from "vitest";
import { parseSentryMappings, resolveJiraProject, invalidSentryMappings } from "./mapping";

describe("parseSentryMappings", () => {
  it("parses simple pairs and uppercases the Jira key", () => {
    expect(parseSentryMappings("mobile-app:EPM,employee-app:mhrm")).toEqual([
      { sentryProject: "mobile-app", jiraProject: "EPM" },
      { sentryProject: "employee-app", jiraProject: "MHRM" },
    ]);
  });

  it("ignores blank segments and malformed entries", () => {
    expect(parseSentryMappings("a:P, ,noColon, :X")).toEqual([{ sentryProject: "a", jiraProject: "P" }]);
  });

  it("returns empty for an empty string", () => {
    expect(parseSentryMappings("")).toEqual([]);
  });

  it("keeps the first mapping on duplicate sentry project keys", () => {
    expect(parseSentryMappings("a:P,a:Q,b:R")).toEqual([
      { sentryProject: "a", jiraProject: "P" },
      { sentryProject: "b", jiraProject: "R" },
    ]);
  });
});

describe("resolveJiraProject", () => {
  const mappings = parseSentryMappings("mobile-app:EPM,employee-app:MHRM");

  it("returns the mapped Jira project on a match", () => {
    expect(resolveJiraProject("mobile-app", mappings, "CICM")).toBe("EPM");
  });

  it("is case-insensitive on the sentry project", () => {
    expect(resolveJiraProject("MOBILE-APP", mappings, "CICM")).toBe("EPM");
  });

  it("returns null when the mapping is set but the project is unmapped", () => {
    expect(resolveJiraProject("unknown-app", mappings, "CICM")).toBeNull();
  });

  it("falls back to the default project when no mapping is configured", () => {
    expect(resolveJiraProject("anything", [], "CICM")).toBe("CICM");
    expect(resolveJiraProject("anything", [], null)).toBeNull();
  });
});

describe("invalidSentryMappings", () => {
  it("flags entries without a colon or an empty side", () => {
    expect(invalidSentryMappings("a:P,noColon, :X")).toEqual(["noColon", ":X"]);
  });

  it("is clean for valid input", () => {
    expect(invalidSentryMappings("a:P,b:Q")).toEqual([]);
  });
});
