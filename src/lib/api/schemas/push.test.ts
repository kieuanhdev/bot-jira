import { describe, expect, it } from "vitest";
import { PushSubscribeBodySchema, PushSubscriptionSchema } from "./push";

const validSub = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test-sub",
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
};

describe("PushSubscriptionSchema", () => {
  it("accepts an https endpoint with both keys", () => {
    expect(PushSubscriptionSchema.safeParse(validSub).success).toBe(true);
  });

  it("rejects a non-https endpoint", () => {
    expect(
      PushSubscriptionSchema.safeParse({ ...validSub, endpoint: "http://example.com/sub" }).success
    ).toBe(false);
  });

  it("rejects an invalid URL and empty keys", () => {
    expect(PushSubscriptionSchema.safeParse({ ...validSub, endpoint: "https://" }).success).toBe(false);
    expect(
      PushSubscriptionSchema.safeParse({ ...validSub, keys: { p256dh: "", auth: "a" } }).success
    ).toBe(false);
    expect(PushSubscriptionSchema.safeParse({ endpoint: validSub.endpoint }).success).toBe(false);
  });
});

describe("PushSubscribeBodySchema", () => {
  it("accepts unsubscribe or a subscription", () => {
    expect(PushSubscribeBodySchema.safeParse({ unsubscribe: true }).success).toBe(true);
    expect(PushSubscribeBodySchema.safeParse({ subscription: validSub }).success).toBe(true);
  });

  it("rejects a non-boolean unsubscribe", () => {
    expect(PushSubscribeBodySchema.safeParse({ unsubscribe: "yes" }).success).toBe(false);
  });
});
