/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  claimJiraSyncLease,
  renewJiraSyncLease,
  releaseJiraSyncLease,
  computeLeaseTtlSeconds,
  SyncLeaseLostError,
} from "./jira-sync-lease";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationCursor: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

// Mock env to control jiraSyncExpireSeconds
vi.mock("@/lib/env", () => ({
  env: {
    jiraSyncExpireSeconds: 900,
    jiraHeartbeatSeconds: 60,
  },
}));

import { prisma } from "@/lib/prisma";

describe("Lease Renewal", () => {
  type CursorRecord = {
    id: string;
    integration: string;
    scope: string;
    cursor: string | null;
    lastStartedAt: Date | null;
    lastSuccessAt: Date | null;
    lastErrorAt: Date | null;
    lastError: string | null;
    stats: any;
    activeRunToken: string | null;
    activeRunStartedAt: Date | null;
    activeRunExpiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };

  let cursorStore: Map<string, CursorRecord>;

  beforeEach(() => {
    vi.clearAllMocks();
    cursorStore = new Map();

    vi.spyOn(prisma.integrationCursor as any, "upsert").mockImplementation(
      async ({ where, create }: any) => {
        const key = `${where.integration_scope.integration}:${where.integration_scope.scope}`;
        if (!cursorStore.has(key)) {
          const record: CursorRecord = {
            id: `cur-${key}`,
            integration: create.integration,
            scope: create.scope,
            cursor: create.cursor ?? null,
            lastStartedAt: create.lastStartedAt ?? null,
            lastSuccessAt: create.lastSuccessAt ?? null,
            lastErrorAt: null,
            lastError: null,
            stats: null,
            activeRunToken: create.activeRunToken ?? null,
            activeRunStartedAt: create.activeRunStartedAt ?? null,
            activeRunExpiresAt: create.activeRunExpiresAt ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          cursorStore.set(key, record);
        }
        return cursorStore.get(key)!;
      }
    );

    vi.spyOn(prisma.integrationCursor as any, "findUnique").mockImplementation(
      async ({ where }: any) => {
        if (where.integration_scope) {
          const key = `${where.integration_scope.integration}:${where.integration_scope.scope}`;
          return cursorStore.get(key) ?? null;
        }
        return null;
      }
    );

    vi.spyOn(prisma.integrationCursor as any, "updateMany").mockImplementation(
      async ({ where, data }: any) => {
        let count = 0;
        for (const record of cursorStore.values()) {
          if (where.integration && record.integration !== where.integration)
            continue;
          if (where.scope && record.scope !== where.scope) continue;
          if (where.activeRunToken && record.activeRunToken !== where.activeRunToken)
            continue;

          if (where.OR) {
            const matchesOr = where.OR.some((clause: any) => {
              if ("activeRunToken" in clause) {
                if (clause.activeRunToken === null && record.activeRunToken === null)
                  return true;
                if (
                  clause.activeRunToken !== null &&
                  record.activeRunToken === clause.activeRunToken
                )
                  return true;
              }
              if ("activeRunExpiresAt" in clause) {
                if (
                  clause.activeRunExpiresAt === null &&
                  record.activeRunExpiresAt === null
                )
                  return true;
                if (
                  clause.activeRunExpiresAt?.lte &&
                  record.activeRunExpiresAt &&
                  record.activeRunExpiresAt <= clause.activeRunExpiresAt.lte
                )
                  return true;
              }
              return false;
            });
            if (!matchesOr) continue;
          }

          Object.assign(record, data, { updatedAt: new Date() });
          count++;
        }
        return { count };
      }
    );
  });

  // Test 1: Job running longer than initial TTL but still renewing → other job cannot claim
  it("long-running job that keeps renewing prevents another job from claiming", async () => {
    const now = new Date();
    const initialExpiry = new Date(now.getTime() + 60_000); // 60s

    // Job A claims lease
    await claimJiraSyncLease("EPM", "token_A", initialExpiry, now);
    expect(cursorStore.get("jira:EPM")?.activeRunToken).toBe("token_A");

    // Simulate time passing beyond initial TTL by extending lease
    const renewedExpiry = new Date(now.getTime() + 120_000); // extend to 120s
    await renewJiraSyncLease("EPM", "token_A", renewedExpiry);

    // Verify lease was extended
    expect(cursorStore.get("jira:EPM")?.activeRunExpiresAt).toEqual(renewedExpiry);

    // Job B tries to claim while Job A's renewed lease is still active
    const jobBNow = new Date(now.getTime() + 90_000); // 90s later, past initial TTL
    const jobBExpiry = new Date(jobBNow.getTime() + 60_000);

    // Since renewedExpiry (120s) > jobBNow (90s), lease is still active
    await expect(
      claimJiraSyncLease("EPM", "token_B", jobBExpiry, jobBNow)
    ).rejects.toThrow(/already running/i);

    // Job A still holds lease
    expect(cursorStore.get("jira:EPM")?.activeRunToken).toBe("token_A");
  });

  // Test 2: Renew with stale token → does NOT change lease of new job
  it("renewal with stale token does not modify new job's lease", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60_000);

    // Job B holds lease
    cursorStore.set("jira:EPM", {
      id: "cur-1",
      integration: "jira",
      scope: "EPM",
      cursor: null,
      lastStartedAt: now,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastError: null,
      stats: null,
      activeRunToken: "token_B",
      activeRunStartedAt: now,
      activeRunExpiresAt: expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    // Old Job A tries to renew with its stale token
    const staleExpiry = new Date(now.getTime() + 120_000);
    await expect(
      renewJiraSyncLease("EPM", "token_A", staleExpiry)
    ).rejects.toThrow(SyncLeaseLostError);

    // Job B's lease is unchanged
    expect(cursorStore.get("jira:EPM")?.activeRunToken).toBe("token_B");
    expect(cursorStore.get("jira:EPM")?.activeRunExpiresAt).toEqual(expiresAt);
  });

  // Test 3: Lease lost during Jira request → should not write cache
  it("lease lost during Jira request prevents further cache writes via SyncLeaseLostError", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60_000);

    cursorStore.set("jira:EPM", {
      id: "cur-1",
      integration: "jira",
      scope: "EPM",
      cursor: null,
      lastStartedAt: now,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastError: null,
      stats: null,
      activeRunToken: "token_A",
      activeRunStartedAt: now,
      activeRunExpiresAt: expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    // Simulate another job taking over while Jira request is in flight
    cursorStore.get("jira:EPM")!.activeRunToken = "token_B";

    // When Job A tries to renew after Jira responds, it should fail
    await expect(
      renewJiraSyncLease("EPM", "token_A", new Date(now.getTime() + 120_000))
    ).rejects.toThrow(SyncLeaseLostError);
  });

  // Test 4: Release lease only works for matching token
  it("release only clears lease for the matching token", async () => {
    const now = new Date();
    cursorStore.set("jira:EPM", {
      id: "cur-1",
      integration: "jira",
      scope: "EPM",
      cursor: null,
      lastStartedAt: now,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastError: null,
      stats: null,
      activeRunToken: "token_B",
      activeRunStartedAt: now,
      activeRunExpiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
    });

    // Job A tries to release with its old token
    const released = await releaseJiraSyncLease("EPM", "token_A");
    expect(released).toBe(false);
    expect(cursorStore.get("jira:EPM")?.activeRunToken).toBe("token_B");

    // Job B releases with correct token
    const releasedB = await releaseJiraSyncLease("EPM", "token_B");
    expect(releasedB).toBe(true);
    expect(cursorStore.get("jira:EPM")?.activeRunToken).toBeNull();
  });
});

describe("computeLeaseTtlSeconds", () => {
  it("returns jiraSyncExpireSeconds for incremental sync", () => {
    const ttl = computeLeaseTtlSeconds(false);
    expect(ttl).toBe(900); // from mock env
  });

  it("returns at least 900 seconds for full sync", () => {
    const ttl = computeLeaseTtlSeconds(true);
    expect(ttl).toBeGreaterThanOrEqual(900);
  });
});

describe("computeLeaseTtlSeconds with low expire config", () => {
  it("full sync with expire configured to 120s still gets minimum 900s lease TTL", async () => {
    // Reset the module with a different env
    const { env } = await import("@/lib/env");
    const original = env.jiraSyncExpireSeconds;

    // Temporarily override
    (env as any).jiraSyncExpireSeconds = 120;
    try {
      const ttl = computeLeaseTtlSeconds(true);
      expect(ttl).toBe(900); // min 900 for full sync
    } finally {
      (env as any).jiraSyncExpireSeconds = original;
    }
  });

  it("incremental sync with expire configured to 120s uses 120s", async () => {
    const { env } = await import("@/lib/env");
    const original = env.jiraSyncExpireSeconds;

    (env as any).jiraSyncExpireSeconds = 120;
    try {
      const ttl = computeLeaseTtlSeconds(false);
      expect(ttl).toBe(120);
    } finally {
      (env as any).jiraSyncExpireSeconds = original;
    }
  });
});
