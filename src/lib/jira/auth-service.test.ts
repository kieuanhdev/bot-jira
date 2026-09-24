import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    jiraBaseUrl: "https://jira.example.com",
    jiraRequestTimeoutMs: 1000,
  },
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: (val: string) => `enc:${val}`,
  safeDecrypt: (val: string | null) => (val?.startsWith("enc:") ? val.slice(4) : val),
}));

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

import {
  computeJiraIdentityKey,
  verifyJiraCredential,
  resolveUserFromJiraIdentity,
  persistVerifiedJiraCredential,
  IdentityCollisionError,
} from "./auth-service";

describe("computeJiraIdentityKey", () => {
  it("prefers key over name", () => {
    expect(computeJiraIdentityKey({ key: "JIRAUSER123", name: "anhnk" })).toBe("key:JIRAUSER123");
  });

  it("trims whitespace on key", () => {
    expect(computeJiraIdentityKey({ key: " JIRAUSER123 " })).toBe("key:JIRAUSER123");
  });

  it("falls back to lowercase normalized name when key is missing", () => {
    expect(computeJiraIdentityKey({ name: "NguyenVan_A" })).toBe("name:nguyenvan_a");
  });

  it("returns null when neither key nor name is provided", () => {
    expect(computeJiraIdentityKey({})).toBeNull();
    expect(computeJiraIdentityKey({ key: "", name: "   " })).toBeNull();
  });
});

describe("verifyJiraCredential", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies valid Bearer token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          key: "USER_01",
          name: "johndoe",
          displayName: "John Doe",
          emailAddress: "john@example.com",
          active: true,
        }),
      }))
    );

    const res = await verifyJiraCredential({ token: "valid-bearer-token" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.mode).toBe("Bearer");
      expect(res.identityKey).toBe("key:USER_01");
      expect(res.displayName).toBe("John Doe");
      expect(res.emailAddress).toBe("john@example.com");
    }
  });

  it("falls back to Basic auth if Bearer fails and username is provided", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init: RequestInit) => {
        callCount++;
        const auth = (init.headers as Record<string, string>).Authorization;
        if (auth.startsWith("Bearer")) {
          return { ok: false, status: 401 } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            key: "USER_BASIC",
            name: "basicuser",
            displayName: "Basic User",
            active: true,
          }),
        } as Response;
      })
    );

    const res = await verifyJiraCredential({
      token: "secret",
      username: "basicuser",
    });

    expect(callCount).toBe(2);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.mode).toBe("basic");
      expect(res.identityKey).toBe("key:USER_BASIC");
    }
  });

  it("rejects invalid token with 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
      }))
    );

    const res = await verifyJiraCredential({ token: "invalid-token" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("invalid_token");
      expect(res.message).toContain("Token Jira không chính xác");
    }
  });

  it("blocks inactive Jira account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          key: "USER_INACTIVE",
          name: "inactive_user",
          active: false,
        }),
      }))
    );

    const res = await verifyJiraCredential({ token: "tok" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("inactive_account");
      expect(res.message).toContain("vô hiệu hóa");
    }
  });

  it("detects missing identity from /myself response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          active: true,
        }),
      }))
    );

    const res = await verifyJiraCredential({ token: "tok" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("missing_identity");
    }
  });

  it("handles timeout error gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const err = new Error("Request timed out");
        err.name = "TimeoutError";
        throw err;
      })
    );

    const res = await verifyJiraCredential({ token: "tok" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("timeout");
    }
  });

  it("handles 500 or 429 server errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
      }))
    );

    const res = await verifyJiraCredential({ token: "tok" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("jira_unavailable");
    }
  });
});

describe("resolveUserFromJiraIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves user by exact jiraIdentityKey match", async () => {
    const existing = {
      id: "user-1",
      jiraIdentityKey: "key:USER_01",
      role: "admin",
      displayName: "Admin One",
    };
    mockPrisma.user.findUnique.mockResolvedValueOnce(existing);

    const res = await resolveUserFromJiraIdentity({
      identityKey: "key:USER_01",
      key: "USER_01",
      name: "admin",
    });

    expect(res.isNew).toBe(false);
    expect(res.method).toBe("jiraIdentityKey");
    expect(res.user.id).toBe("user-1");
    expect(res.user.role).toBe("admin");
  });

  it("resolves existing user by username and _mb alias", async () => {
    // 1. byKey -> null
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    // 2. findMany potential -> 1 candidate
    const existing = {
      id: "user-2",
      jiraUsername: "anhnk_mb",
      jiraIdentityKey: null,
      role: "member",
    };
    mockPrisma.user.findMany.mockResolvedValueOnce([existing]);

    const res = await resolveUserFromJiraIdentity({
      identityKey: "key:USER_02",
      key: "USER_02",
      name: "anhnk",
    });

    expect(res.isNew).toBe(false);
    expect(res.method).toBe("username_alias");
    expect(res.user.id).toBe("user-2");
  });

  it("resolves user by unique email fallback if user has no jiraIdentityKey", async () => {
    // 1. byKey -> null
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    // 2. findMany potential -> none
    mockPrisma.user.findMany.mockResolvedValueOnce([]);
    // 3. byEmail -> found
    const existing = {
      id: "user-3",
      email: "staff@company.vn",
      jiraIdentityKey: null,
      role: "release_manager",
    };
    mockPrisma.user.findUnique.mockResolvedValueOnce(existing);

    const res = await resolveUserFromJiraIdentity({
      identityKey: "key:USER_03",
      key: "USER_03",
      name: "staff",
      emailAddress: "staff@company.vn",
    });

    expect(res.isNew).toBe(false);
    expect(res.method).toBe("email");
    expect(res.user.id).toBe("user-3");
    expect(res.user.role).toBe("release_manager");
  });

  it("throws IdentityCollisionError when multiple profiles match", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockPrisma.user.findMany.mockResolvedValueOnce([
      { id: "u-1", jiraUsername: "anhnk", jiraIdentityKey: null },
      { id: "u-2", jiraUsername: "anhnk_mb", jiraIdentityKey: null },
    ]);

    await expect(
      resolveUserFromJiraIdentity({
        identityKey: "key:USER_MULTI",
        name: "anhnk",
      })
    ).rejects.toThrow(IdentityCollisionError);
  });

  it("creates new user with role 'member' if no existing user matched", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([]);
    const createdUser = {
      id: "new-user-1",
      displayName: "New Dev",
      role: "member",
      jiraIdentityKey: "key:NEW_DEV",
      jiraUsername: "newdev",
    };
    mockPrisma.user.create.mockResolvedValueOnce(createdUser);

    const res = await resolveUserFromJiraIdentity({
      identityKey: "key:NEW_DEV",
      name: "newdev",
      displayName: "New Dev",
      emailAddress: "newdev@team.vn",
    });

    expect(res.isNew).toBe(true);
    expect(res.method).toBe("created");
    expect(res.user.role).toBe("member");
    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "member",
          jiraIdentityKey: "key:NEW_DEV",
        }),
      })
    );
  });
});

describe("persistVerifiedJiraCredential", () => {
  it("encrypts token and updates user", async () => {
    mockPrisma.user.update.mockResolvedValueOnce({ id: "user-1" });

    await persistVerifiedJiraCredential(
      "user-1",
      { token: "raw-token", username: "dev", mode: "Bearer" },
      { identityKey: "key:DEV", name: "dev", displayName: "Dev Person" }
    );

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        jiraTokenEnc: "enc:raw-token",
        jiraAuth: "Bearer",
        jiraIdentityKey: "key:DEV",
        jiraUsername: "dev",
      }),
    });
  });
});
