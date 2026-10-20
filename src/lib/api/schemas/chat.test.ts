import { describe, expect, it } from "vitest";
import { ChatLinkBodySchema, ChatUnlinkBodySchema, DiscordIntegrationBodySchema } from "./chat";

describe("ChatLinkBodySchema", () => {
  it("accepts a link body", () => {
    expect(ChatLinkBodySchema.safeParse({ provider: "discord", externalId: "1" }).success).toBe(true);
  });
  it("rejects a non-string externalId", () => {
    expect(ChatLinkBodySchema.safeParse({ externalId: 1 }).success).toBe(false);
  });
});

describe("ChatUnlinkBodySchema", () => {
  it("accepts an empty object", () => {
    expect(ChatUnlinkBodySchema.safeParse({}).success).toBe(true);
  });
  it("rejects a non-string provider", () => {
    expect(ChatUnlinkBodySchema.safeParse({ provider: 1 }).success).toBe(false);
  });
});

describe("DiscordIntegrationBodySchema", () => {
  it("accepts both destination types", () => {
    expect(DiscordIntegrationBodySchema.safeParse({ destinationType: "webhook", webhookUrl: "u" }).success).toBe(true);
    expect(DiscordIntegrationBodySchema.safeParse({ destinationType: "user_id", discordUserId: "1" }).success).toBe(true);
  });
  it("reports an unknown destinationType on that path", () => {
    const r = DiscordIntegrationBodySchema.safeParse({ destinationType: "sms" });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].path).toEqual(["destinationType"]);
  });
  it("rejects a missing destinationType", () => {
    expect(DiscordIntegrationBodySchema.safeParse({}).success).toBe(false);
  });
});
