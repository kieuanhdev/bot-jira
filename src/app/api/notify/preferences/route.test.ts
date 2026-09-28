import { describe, expect, it, vi, beforeEach } from "vitest";

const { prismaMock, sessionMock } = vi.hoisted(() => ({
  prismaMock: {
    notificationPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
  sessionMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({ getSession: sessionMock }));

import { GET, PATCH, KNOWN_TYPES, isKnownType } from "./route";

describe("Notification Preferences API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("KNOWN_TYPES and isKnownType", () => {
    it("recognizes all 9 system notification types", () => {
      const expected = [
        "comment",
        "issue",
        "release",
        "transition",
        "stale",
        "ai",
        "sentry",
        "ci",
        "system",
      ];
      expect(KNOWN_TYPES).toEqual(expected);
      for (const t of expected) {
        expect(isKnownType(t)).toBe(true);
      }
      expect(isKnownType("unknown_type")).toBe(false);
    });
  });

  describe("GET /api/notify/preferences", () => {
    it("returns 401 when unauthorized", async () => {
      sessionMock.mockResolvedValue(null);
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("returns user preferences and subscription status", async () => {
      sessionMock.mockResolvedValue({ user: { id: "user-123" } });
      prismaMock.notificationPreference.findUnique.mockResolvedValue({
        userId: "user-123",
        disabledTypes: ["comment"],
        pushEnabled: true,
        pushDisabledTypes: ["system"],
        deliveryMode: "digest",
        digestHour: 9,
      });
      prismaMock.user.findUnique.mockResolvedValue({
        pushSubscription: { endpoint: "https://example.com" },
      });

      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        disabledTypes: ["comment"],
        pushEnabled: true,
        pushDisabledTypes: ["system"],
        deliveryMode: "digest",
        digestHour: 9,
        hasSubscription: true,
        knownTypes: KNOWN_TYPES,
      });
    });

    it("returns default values when preference row does not exist", async () => {
      sessionMock.mockResolvedValue({ user: { id: "user-123" } });
      prismaMock.notificationPreference.findUnique.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue({ pushSubscription: null });

      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.disabledTypes).toEqual([]);
      expect(data.pushEnabled).toBe(false);
      expect(data.pushDisabledTypes).toEqual([]);
      expect(data.deliveryMode).toBe("instant");
      expect(data.digestHour).toBe(8);
      expect(data.hasSubscription).toBe(false);
    });
  });

  describe("PATCH /api/notify/preferences", () => {
    it("returns 401 when unauthorized", async () => {
      sessionMock.mockResolvedValue(null);
      const req = new Request("http://localhost/api/notify/preferences", {
        method: "PATCH",
        body: JSON.stringify({ disabledTypes: ["comment"] }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(401);
    });

    it("validates that disabledTypes is an array", async () => {
      sessionMock.mockResolvedValue({ user: { id: "user-123" } });
      const req = new Request("http://localhost/api/notify/preferences", {
        method: "PATCH",
        body: JSON.stringify({ disabledTypes: "invalid" }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("disabledTypes must be an array");
    });

    it("rejects unknown notification types in disabledTypes", async () => {
      sessionMock.mockResolvedValue({ user: { id: "user-123" } });
      const req = new Request("http://localhost/api/notify/preferences", {
        method: "PATCH",
        body: JSON.stringify({ disabledTypes: ["invalid_type"] }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Unknown notification type: invalid_type");
    });

    it("rejects unknown notification types in pushDisabledTypes", async () => {
      sessionMock.mockResolvedValue({ user: { id: "user-123" } });
      const req = new Request("http://localhost/api/notify/preferences", {
        method: "PATCH",
        body: JSON.stringify({ pushDisabledTypes: ["bad_type"] }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Unknown push notification type: bad_type");
    });

    it("updates preferences successfully", async () => {
      sessionMock.mockResolvedValue({ user: { id: "user-123" } });
      prismaMock.notificationPreference.upsert.mockResolvedValue({
        userId: "user-123",
        disabledTypes: ["comment", "issue"],
        pushEnabled: true,
        pushDisabledTypes: ["stale"],
        deliveryMode: "digest",
        digestHour: 10,
      });
      prismaMock.user.findUnique.mockResolvedValue({ pushSubscription: null });

      const req = new Request("http://localhost/api/notify/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          disabledTypes: ["comment", "issue"],
          pushEnabled: true,
          pushDisabledTypes: ["stale"],
          deliveryMode: "digest",
          digestHour: 10,
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.disabledTypes).toEqual(["comment", "issue"]);
      expect(json.pushEnabled).toBe(true);
      expect(json.pushDisabledTypes).toEqual(["stale"]);
      expect(json.deliveryMode).toBe("digest");
      expect(json.digestHour).toBe(10);
    });
  });
});
