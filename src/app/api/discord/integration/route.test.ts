import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  save: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/chat/discord-integration", () => ({
  getDiscordIntegration: mocks.get,
  removeDiscordIntegration: vi.fn(),
  saveDiscordIntegration: mocks.save,
}));

import { PUT } from "./route";

function put(body: unknown) {
  return PUT(new Request("http://localhost/api/discord/integration", { method: "PUT", body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "u1" } });
  mocks.get.mockResolvedValue(null);
});

describe("PUT /api/discord/integration", () => {
  it("keeps the destinationType message for an unknown type", async () => {
    const res = await put({ destinationType: "sms" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("destinationType must be webhook or user_id");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("saves a valid webhook destination", async () => {
    const res = await put({ destinationType: "webhook", webhookUrl: "https://discord.com/api/webhooks/1/x" });
    expect(res.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith({
      userId: "u1",
      destinationType: "webhook",
      discordUserId: undefined,
      webhookUrl: "https://discord.com/api/webhooks/1/x",
    });
  });
});
