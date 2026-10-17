import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUnique: vi.fn(),
  hasOpenAi: vi.fn(),
  creds: vi.fn(),
  latest: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
  isAdmin: (s: { user?: { role?: string } } | null) => s?.user?.role === "admin",
}));
vi.mock("@/lib/prisma", () => ({ prisma: { sentryIssueImported: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/env", () => ({ hasOpenAiConfig: mocks.hasOpenAi }));
vi.mock("@/lib/sentry/creds-for-project", () => ({ sentryCredsForProject: mocks.creds }));
vi.mock("@/lib/sentry/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sentry/client")>("@/lib/sentry/client");
  return { ...actual, getLatestEvent: mocks.latest };
});
vi.mock("@/lib/ai/generate-json", () => ({ generateJson: mocks.generate }));

import { AiUnavailableError } from "@/lib/ai/errors";
import { POST } from "./route";

const call = () =>
  POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "row-1" }) });

const dbRow = {
  id: "row-1",
  sentryProject: "web",
  sentryIssueId: "4242",
  shortId: "WEB-1A",
  title: "TypeError",
  permalinkUrl: "https://sentry.example.com/issues/4242/",
  level: "error",
  eventCount: 3,
  firstSeen: new Date("2026-10-01T00:00:00Z"),
  lastSeen: new Date("2026-10-16T00:00:00Z"),
};

describe("POST /api/admin/sentry-import/[id]/ai-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    mocks.hasOpenAi.mockReturnValue(true);
    mocks.findUnique.mockResolvedValue(dbRow);
    mocks.creds.mockResolvedValue({ org: "acme", project: "web", token: "t" });
    mocks.latest.mockResolvedValue({
      eventID: "e1",
      culprit: "checkout in submitOrder",
      entries: [],
    });
    mocks.generate.mockImplementation(async (prompt: string, parse: (o: unknown) => unknown) =>
      parse({ summary: `Lỗi checkout (${prompt.includes("submitOrder") ? "event" : "basic"})`, description: "Mô tả" })
    );
  });

  it("requires a session and an admin", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await call()).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ user: { id: "u", role: "member" } });
    expect((await call()).status).toBe(403);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("returns 503 when AI is not configured", async () => {
    mocks.hasOpenAi.mockReturnValue(false);
    expect((await call()).status).toBe(503);
  });

  it("returns 404 for an unknown row", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("summarizes with the latest event when it can be fetched", async () => {
    const res = await call();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ summary: "[Sentry] WEB-1A: Lỗi checkout (event)", usedEvent: true });
    expect(json.description).toContain(dbRow.permalinkUrl);
    expect(mocks.latest).toHaveBeenCalledWith("4242", { org: "acme", project: "web", token: "t" }, { timeoutMs: 10_000 });
  });

  it("falls back to the basic snapshot when no creds or the event fetch fails", async () => {
    mocks.creds.mockResolvedValueOnce(null);
    let json = await (await call()).json();
    expect(json).toMatchObject({ summary: "[Sentry] WEB-1A: Lỗi checkout (basic)", usedEvent: false });
    expect(mocks.latest).not.toHaveBeenCalled();

    mocks.latest.mockRejectedValueOnce(new Error("Sentry -> 403"));
    json = await (await call()).json();
    expect(json.usedEvent).toBe(false);
  });

  it("returns 502 when the AI does not answer", async () => {
    mocks.generate.mockRejectedValue(new AiUnavailableError("timeout"));
    const res = await call();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("AI không phản hồi, thử lại");
  });
});
