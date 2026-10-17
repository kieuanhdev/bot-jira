import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  env: { sentryOrg: "env-org", sentryProject: "mobile-app", sentryToken: "env-token" },
  users: [] as {
    sentryOrg: string | null;
    sentryMappings: string | null;
    sentryTokenEnc: string | null;
  }[],
  findMany: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: m.env }));
vi.mock("@/lib/crypto", () => ({ safeDecrypt: (v: string | null) => v }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findMany: m.findMany } } }));

import { sentryCredsForProject } from "./creds-for-project";

describe("sentryCredsForProject", () => {
  beforeEach(() => {
    m.env.sentryOrg = "env-org";
    m.env.sentryProject = "mobile-app";
    m.env.sentryToken = "env-token";
    m.users = [
      { sentryOrg: "org-a", sentryMappings: "web-a:EPM", sentryTokenEnc: "token-a" },
      { sentryOrg: "org-b", sentryMappings: "web-b:ECM,web-c:EIM", sentryTokenEnc: "token-b" },
    ];
    m.findMany.mockReset();
    m.findMany.mockImplementation(async () => m.users);
  });

  it("uses env creds when the slug is the env project", async () => {
    await expect(sentryCredsForProject("mobile-app")).resolves.toEqual({
      org: "env-org",
      project: "mobile-app",
      token: "env-token",
    });
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("uses the creds of a user whose mapping includes the slug", async () => {
    await expect(sentryCredsForProject("web-c")).resolves.toEqual({
      org: "org-b",
      project: "web-c",
      token: "token-b",
    });
  });

  it("falls back to users when env creds are incomplete", async () => {
    m.env.sentryToken = "";
    m.users.push({ sentryOrg: "org-c", sentryMappings: "mobile-app:EPM", sentryTokenEnc: "token-c" });
    await expect(sentryCredsForProject("mobile-app")).resolves.toEqual({
      org: "org-c",
      project: "mobile-app",
      token: "token-c",
    });
  });

  it("returns null when nobody maps the slug", async () => {
    await expect(sentryCredsForProject("unknown")).resolves.toBeNull();
  });

  it("returns null for an empty slug or when the user lookup fails", async () => {
    await expect(sentryCredsForProject("")).resolves.toBeNull();
    m.findMany.mockRejectedValueOnce(new Error("db down"));
    await expect(sentryCredsForProject("web-a")).resolves.toBeNull();
  });
});
