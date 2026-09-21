import { describe, expect, it } from "vitest";
import { jiraUsernameAliases } from "./user-creds";

describe("jiraUsernameAliases", () => {
  it("treats suffixed and unsuffixed mobile usernames as one identity", () => {
    expect(jiraUsernameAliases("anhnk")).toEqual(["anhnk", "anhnk_mb"]);
    expect(jiraUsernameAliases("anhnk_mb")).toEqual(["anhnk_mb", "anhnk"]);
  });

  it("uses the local part when a profile contains an email address", () => {
    expect(jiraUsernameAliases("anhnk@company.vn")).toEqual(["anhnk", "anhnk_mb"]);
  });

  it("returns no aliases for an empty identity", () => {
    expect(jiraUsernameAliases(null)).toEqual([]);
  });
});
