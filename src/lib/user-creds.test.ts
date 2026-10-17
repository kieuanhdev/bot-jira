import { beforeEach, describe, expect, it } from "vitest";
import { encrypt } from "@/lib/crypto";
import { jiraUsernameAliases, userSentryCreds } from "./user-creds";

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

describe("userSentryCreds", () => {
  beforeEach(() => {
    process.env.CRED_ENCRYPTION_KEY = "test-key-for-user-creds";
  });

  it("returns org, token and parsed mappings", () => {
    const creds = userSentryCreds({
      sentryOrg: "my-org",
      sentryMappings: "mobile-app:epm, web:MHRM",
      sentryTokenEnc: encrypt("secret-token"),
    });
    expect(creds).toEqual({
      org: "my-org",
      token: "secret-token",
      mappings: [
        { sentryProject: "mobile-app", jiraProject: "EPM" },
        { sentryProject: "web", jiraProject: "MHRM" },
      ],
    });
  });

  it("returns null without a token, org or mappings", () => {
    expect(userSentryCreds(null)).toBeNull();
    expect(userSentryCreds({ sentryOrg: "o", sentryMappings: "a:B" })).toBeNull();
    expect(
      userSentryCreds({ sentryTokenEnc: encrypt("t"), sentryMappings: "a:B" })
    ).toBeNull();
    expect(userSentryCreds({ sentryOrg: "o", sentryTokenEnc: encrypt("t") })).toBeNull();
  });

  it("returns null when the stored token cannot be decrypted", () => {
    expect(
      userSentryCreds({ sentryOrg: "o", sentryMappings: "a:B", sentryTokenEnc: "not-valid" })
    ).toBeNull();
  });
});
