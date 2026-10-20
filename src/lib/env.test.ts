import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { validateProductionSecrets } from "./env";

const setEnv = (key: string, val: string | undefined) => {
  if (val === undefined) {
    delete (process.env as Record<string, string | undefined>)[key];
  } else {
    (process.env as Record<string, string | undefined>)[key] = val;
  }
};

describe("validateProductionSecrets (REF-017)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("does not throw in development or test even when secrets are missing", () => {
    setEnv("NODE_ENV", "development");
    setEnv("NEXTAUTH_SECRET", undefined);
    setEnv("CRED_ENCRYPTION_KEY", undefined);
    expect(() => validateProductionSecrets()).not.toThrow();

    setEnv("NODE_ENV", "test");
    expect(() => validateProductionSecrets()).not.toThrow();
  });

  it("does not throw during next build (phase-production-build) in production", () => {
    setEnv("NODE_ENV", "production");
    setEnv("NEXT_PHASE", "phase-production-build");
    setEnv("NEXTAUTH_SECRET", undefined);
    setEnv("CRED_ENCRYPTION_KEY", undefined);
    expect(() => validateProductionSecrets()).not.toThrow();
  });

  it("throws clear error when NEXTAUTH_SECRET is missing in production runtime", () => {
    setEnv("NODE_ENV", "production");
    setEnv("NEXT_PHASE", undefined);
    setEnv("NEXTAUTH_SECRET", undefined);
    setEnv("CRED_ENCRYPTION_KEY", "dummy-encryption-key-for-test-32chars");

    expect(() => validateProductionSecrets()).toThrowError(/NEXTAUTH_SECRET/);
  });

  it("throws clear error when CRED_ENCRYPTION_KEY is missing in production runtime", () => {
    setEnv("NODE_ENV", "production");
    setEnv("NEXT_PHASE", undefined);
    setEnv("NEXTAUTH_SECRET", "dummy-auth-secret");
    setEnv("CRED_ENCRYPTION_KEY", undefined);

    expect(() => validateProductionSecrets()).toThrowError(/CRED_ENCRYPTION_KEY/);
  });

  it("does not throw in production runtime when all required secrets are provided", () => {
    setEnv("NODE_ENV", "production");
    setEnv("NEXT_PHASE", undefined);
    setEnv("NEXTAUTH_SECRET", "dummy-auth-secret");
    setEnv("CRED_ENCRYPTION_KEY", "dummy-encryption-key-for-test-32chars");

    expect(() => validateProductionSecrets()).not.toThrow();
  });
});

describe("env parsing fallbacks", () => {
  const originalEnv = { ...process.env };

  const load = async (vars: Record<string, string | undefined>) => {
    vi.resetModules();
    process.env = { ...originalEnv };
    for (const [k, v] of Object.entries(vars)) setEnv(k, v);
    return import("./env");
  };

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("falls back to snapshot for an unknown membership mode and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { env } = await load({ JIRA_BOARD_MEMBERSHIP_MODE: "bogus" });
    expect(env.jiraBoardMembershipMode).toBe("snapshot");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("JIRA_BOARD_MEMBERSHIP_MODE");
  });

  it("accepts a membership mode case-insensitively", async () => {
    const { env } = await load({ JIRA_BOARD_MEMBERSHIP_MODE: "SYNC" });
    expect(env.jiraBoardMembershipMode).toBe("sync");
  });

  it("clamps the poll concurrency to 4", async () => {
    const { env } = await load({ JIRA_POLL_CONCURRENCY: "9" });
    expect(env.jiraPollConcurrency).toBe(4);
  });

  it("clamps the sync page cap up to 50", async () => {
    const { env } = await load({ JIRA_SYNC_MAX_PAGES: "3" });
    expect(env.jiraSyncMaxPages).toBe(50);
  });

  it("uses the default for a non-numeric int and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { env } = await load({ POLL_INTERVAL_MS: "soon" });
    expect(env.pollIntervalMs).toBe(60000);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("keeps only valid project:boardId pairs", async () => {
    const { projectBoardIds } = await load({ JIRA_PROJECT_BOARD_IDS: "abc:12, def:x" });
    expect(projectBoardIds).toEqual({ ABC: 12 });
  });

  it("upper-cases and dedupes the project key list", async () => {
    const { jiraProjectList } = await load({ JIRA_PROJECT_KEYS: "a, b ,A" });
    expect(jiraProjectList).toEqual(["A", "B"]);
  });

  it("parses column and backlog maps", async () => {
    const { projectColumns, boardBacklogColumns } = await load({
      JIRA_PROJECT_COLUMNS: "epm:Backlog|Done, bad, MR:",
      JIRA_BOARD_BACKLOG_COLUMNS: "101:Product Queue,epm:Backlog",
    });
    expect(projectColumns).toEqual({ EPM: ["Backlog", "Done"] });
    expect(boardBacklogColumns).toEqual({ "101": "Product Queue", EPM: "Backlog" });
  });
});
