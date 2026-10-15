import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => prismaMock);

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
  },
}));

vi.hoisted(() => {
  process.env.LEGACY_PASSWORD_LOGIN = "1";
});

import bcrypt from "bcryptjs";
import { _resetRateLimits } from "./rate-limit";
import { authOptions } from "./auth";

describe("auth rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimits();
  });

  it("rejects 11th failed legacy login within the window", async () => {
    const legacyProvider = authOptions.providers.find(
      (p) => (p as { options?: { id?: string } }).options?.id === "credentials"
    ) as { options?: { authorize?: (creds: Record<string, string>, req: unknown) => Promise<unknown> } };

    expect(legacyProvider?.options?.authorize).toBeDefined();
    const authorize = legacyProvider.options!.authorize!;

    // User exists with password hash, but password compare returns false (wrong password)
    prismaMock.prisma.user.findUnique.mockResolvedValue({
      id: "u-legacy",
      email: "victim@example.com",
      passwordHash: "hashed-pw",
      displayName: "Victim",
      role: "member",
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    // First 10 failed attempts return null (invalid credentials)
    for (let i = 0; i < 10; i++) {
      const res = await authorize(
        { email: "victim@example.com", password: "wrong-password" },
        {}
      );
      expect(res).toBeNull();
    }

    // 11th attempt within the window should be blocked by rate limit
    await expect(
      authorize(
        { email: "victim@example.com", password: "wrong-password" },
        {}
      )
    ).rejects.toThrow("Quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau ít phút.");
  });

  it("keys rate limit by account identifier rather than spoofed x-forwarded-for", async () => {
    const legacyProvider = authOptions.providers.find(
      (p) => (p as { options?: { id?: string } }).options?.id === "credentials"
    ) as { options?: { authorize?: (creds: Record<string, string>, req: unknown) => Promise<unknown> } };

    const authorize = legacyProvider.options!.authorize!;

    prismaMock.prisma.user.findUnique.mockResolvedValue({
      id: "u-legacy",
      email: "victim@example.com",
      passwordHash: "hashed-pw",
      displayName: "Victim",
      role: "member",
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    // Attacker rotates spoofed x-forwarded-for on every attempt
    for (let i = 0; i < 10; i++) {
      const res = await authorize(
        { email: "victim@example.com", password: "wrong-password" },
        { headers: { "x-forwarded-for": `192.168.1.${i}` } }
      );
      expect(res).toBeNull();
    }

    // 11th attempt with yet another new IP is still blocked because account identifier is limited
    await expect(
      authorize(
        { email: "victim@example.com", password: "wrong-password" },
        { headers: { "x-forwarded-for": "10.99.99.99" } }
      )
    ).rejects.toThrow("Quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau ít phút.");
  });
});
