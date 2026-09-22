import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import {
  verifyDiscordSignature,
  normalizeDiscordInbound,
  renderText,
  setDiscordFetch,
  discordProvider,
} from "./discord";
import type { ChatMessagePayload } from "./index";

const SECRET = "test-discosecret";

describe("verifyDiscordSignature", () => {
  it("accepts a valid HMAC-SHA256 signature", () => {
    process.env.DISCORD_WEBHOOK_SECRET = SECRET;
    const body = JSON.stringify({ content: "hi" });
    const sig = createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
    expect(verifyDiscordSignature(body, sig)).toBe(true);
  });

  it("rejects a tampered body", () => {
    process.env.DISCORD_WEBHOOK_SECRET = SECRET;
    const sig = createHmac("sha256", SECRET).update('{"a":1}', "utf8").digest("hex");
    expect(verifyDiscordSignature('{"a":2}', sig)).toBe(false);
  });

  it("rejects when no secret is configured (fail closed)", () => {
    delete process.env.DISCORD_WEBHOOK_SECRET;
    expect(verifyDiscordSignature("body", "sig")).toBe(false);
  });

  it("rejects a missing signature", () => {
    process.env.DISCORD_WEBHOOK_SECRET = SECRET;
    expect(verifyDiscordSignature("body", undefined)).toBe(false);
  });
});

describe("normalizeDiscordInbound", () => {
  it("maps a Discord payload to the vendor-neutral shape", () => {
    const out = normalizeDiscordInbound({
      id: "msg-1",
      author: { id: "user-1", username: "alice" },
      channel_id: "chan-1",
      content: "  /task PROJ-1  ",
    });
    expect(out).toEqual({
      provider: "discord",
      externalMessageId: "msg-1",
      externalAuthorId: "user-1",
      authorName: "alice",
      text: "/task PROJ-1",
      channelId: "chan-1",
    });
  });

  it("returns null for a non-message payload", () => {
    expect(normalizeDiscordInbound({ foo: "bar" })).toBeNull();
  });
});

describe("renderText", () => {
  it("falls back to the plain text", () => {
    expect(renderText({ text: "Hello" })).toBe("Hello");
  });
  it("renders fields as labels", () => {
    const payload: ChatMessagePayload = {
      text: "Task",
      blocks: [{ kind: "fields", fields: [{ label: "Status", value: "Done" }] }],
    };
    expect(renderText(payload)).toContain("**Status:** Done");
  });
});

describe("discordProvider.send", () => {
  beforeEach(() => {
    process.env.DISCORD_BOT_TOKEN = "bot-token";
    process.env.DISCORD_CHANNEL_ID = "chan-1";
    vi.clearAllMocks();
  });

  it("posts an embed to the configured channel", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "new-msg" }), { status: 200 }));
    setDiscordFetch(fetchMock);
    const id = await discordProvider.send("", { text: "Release 1.4.2 ready" });
    expect(id).toBe("new-msg");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toContain("/channels/chan-1/messages");
    const body = JSON.parse(init.body);
    expect(body.embeds[0].title).toBe("Release 1.4.2 ready");
  });

  it("throws when Discord returns an error status", async () => {
    setDiscordFetch(vi.fn(async () => new Response("nope", { status: 403 })));
    await expect(discordProvider.send("", { text: "x" })).rejects.toThrow(/Discord 403/);
  });
});
