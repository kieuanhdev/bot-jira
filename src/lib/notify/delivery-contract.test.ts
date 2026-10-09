import { describe, expect, it } from "vitest";
import {
  sanitizeErrorMessage,
  classifyPushError,
  classifyChatError,
  classifyDeliveryError,
  computeOutboxTransition,
  type OutboxItem,
} from "./delivery-contract";

describe("sanitizeErrorMessage", () => {
  it("redacts Discord webhook URLs containing secret tokens", () => {
    const raw =
      "Error: fetch failed to https://discord.com/api/webhooks/123456789/SuperSecretToken12345?wait=true";
    const sanitized = sanitizeErrorMessage(raw);
    expect(sanitized).not.toContain("SuperSecretToken12345");
    expect(sanitized).toContain("https://discord.com/api/webhooks/123456789/[REDACTED_WEBHOOK_TOKEN]");
  });

  it("redacts Discord app webhook URLs", () => {
    const raw =
      "Error POST https://discordapp.com/api/v10/webhooks/987654321/AnotherSecretTokenXYZ";
    const sanitized = sanitizeErrorMessage(raw);
    expect(sanitized).not.toContain("AnotherSecretTokenXYZ");
    expect(sanitized).toContain("https://discordapp.com/api/v10/webhooks/987654321/[REDACTED_WEBHOOK_TOKEN]");
  });

  it("redacts Bot and Bearer authorization tokens", () => {
    const raw = "Request failed: Bot MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.ABCDEF.GHIJKLMNOP and Bearer my-secret-jwt-token-value";
    const sanitized = sanitizeErrorMessage(raw);
    expect(sanitized).not.toContain("MTIzNDU2Nzg5MDEyMzQ1Njc4OQ");
    expect(sanitized).not.toContain("my-secret-jwt-token-value");
    expect(sanitized).toContain("Bot [REDACTED_TOKEN]");
    expect(sanitized).toContain("Bearer [REDACTED_TOKEN]");
  });

  it("redacts generic token query params", () => {
    const raw = "HTTP 403 at https://api.service.com/notify?token=secret123456&foo=bar";
    const sanitized = sanitizeErrorMessage(raw);
    expect(sanitized).not.toContain("secret123456");
    expect(sanitized).toContain("token=[REDACTED]");
  });

  it("caps long messages at 500 characters", () => {
    const long = "A".repeat(800);
    const sanitized = sanitizeErrorMessage(long);
    expect(sanitized.length).toBe(500);
  });

  it("handles empty or falsy strings gracefully", () => {
    expect(sanitizeErrorMessage("")).toBe("");
  });
});

describe("classifyPushError", () => {
  it("identifies 404 as subscription gone", () => {
    const res = classifyPushError(new Error("WebPush 404: Not Found"));
    expect(res.isSubscriptionGone).toBe(true);
    expect(res.isRetryable).toBe(false);
  });

  it("identifies 410 as subscription gone", () => {
    const res = classifyPushError(new Error("WebPush 410: Gone"));
    expect(res.isSubscriptionGone).toBe(true);
    expect(res.isRetryable).toBe(false);
  });

  it("identifies expired or not found regex as subscription gone", () => {
    const res = classifyPushError(new Error("Push subscription expired on endpoint"));
    expect(res.isSubscriptionGone).toBe(true);
    expect(res.isRetryable).toBe(false);
  });

  it("treats 500 server error as retryable with active subscription", () => {
    const res = classifyPushError(new Error("WebPush 500: Internal Server Error"));
    expect(res.isSubscriptionGone).toBe(false);
    expect(res.isRetryable).toBe(true);
  });

  it("handles non-error objects", () => {
    const res = classifyPushError("network timeout");
    expect(res.isSubscriptionGone).toBe(false);
    expect(res.isRetryable).toBe(true);
    expect(res.sanitizedMessage).toBe("network timeout");
  });
});

describe("classifyChatError", () => {
  it("extracts retryAfterMs from error object", () => {
    const error = Object.assign(new Error("Rate limited"), { retryAfterMs: 4500 });
    const res = classifyChatError(error);
    expect(res.retryAfterMs).toBe(4500);
    expect(res.isRetryable).toBe(true);
    expect(res.isSubscriptionGone).toBe(false);
  });

  it("marks invalid Discord user ID as non-retryable", () => {
    const res = classifyChatError(new Error("Invalid Discord User ID"));
    expect(res.isRetryable).toBe(false);
    expect(res.retryAfterMs).toBeUndefined();
  });

  it("marks standard error as retryable and sanitizes message", () => {
    const res = classifyChatError(
      new Error("Discord 502: failed at https://discord.com/api/webhooks/123/SecretPassKey")
    );
    expect(res.isRetryable).toBe(true);
    expect(res.sanitizedMessage).not.toContain("SecretPassKey");
  });
});

describe("classifyDeliveryError", () => {
  it("routes discord and chat channels to chat classifier", () => {
    const err = Object.assign(new Error("rate limit"), { retryAfterMs: 2500 });
    expect(classifyDeliveryError("discord", err).retryAfterMs).toBe(2500);
    expect(classifyDeliveryError("chat", err).retryAfterMs).toBe(2500);
  });

  it("routes push channel to push classifier", () => {
    const err = new Error("410 Gone");
    expect(classifyDeliveryError("push", err).isSubscriptionGone).toBe(true);
  });
});

describe("computeOutboxTransition", () => {
  const baseItem: OutboxItem = {
    id: "out-1",
    userId: "u-1",
    channel: "push",
    title: "Notice",
    body: "Details",
    link: "/task/1",
    attemptCount: 0,
  };
  const fixedNow = new Date("2026-10-09T12:00:00Z");

  it("handles sent outcome: terminal success, clears lastError, sets deliveredAt", () => {
    const res = computeOutboxTransition({
      item: baseItem,
      outcome: { status: "sent" },
      maxAttempts: 5,
      now: fixedNow,
    });

    expect(res.state).toBe("sent");
    expect(res.deliveredAt).toEqual(fixedNow);
    expect(res.lastError).toBeNull();
    expect(res.isTerminalSuccess).toBe(true);
    expect(res.isTerminalSkipped).toBe(false);
    expect(res.isExhaustedFailure).toBe(false);
    expect(res.isRescheduled).toBe(false);
  });

  it("handles skipped outcome with reason and optional cleanup subscription", () => {
    const res = computeOutboxTransition({
      item: baseItem,
      outcome: { status: "skipped", reason: "subscription gone", cleanupSubscription: true },
      maxAttempts: 5,
      now: fixedNow,
    });

    expect(res.state).toBe("skipped");
    expect(res.deliveredAt).toEqual(fixedNow);
    expect(res.lastError).toBe("subscription gone");
    expect(res.cleanupPushSubscription).toBe(true);
    expect(res.isTerminalSkipped).toBe(true);
    expect(res.isTerminalSuccess).toBe(false);
  });

  it("handles retry outcome within attempt budget: schedules next retry with backoff", () => {
    const res = computeOutboxTransition({
      item: { ...baseItem, attemptCount: 1 },
      outcome: { status: "retry", error: "service unavailable" },
      maxAttempts: 5,
      now: fixedNow,
      computeBackoffMs: (attempts) => 30_000 * (attempts + 1),
    });

    expect(res.state).toBe("pending");
    expect(res.attemptCount).toBe(2);
    expect(res.lastError).toBe("service unavailable");
    expect(res.isRescheduled).toBe(true);
    expect(res.isExhaustedFailure).toBe(false);
    // delay for attempts = 2 is 30_000 * 2 = 60_000ms
    expect(res.scheduledAt).toEqual(new Date("2026-10-09T12:01:00Z"));
  });

  it("handles retry outcome respecting retryAfterMs over exponential backoff", () => {
    const res = computeOutboxTransition({
      item: { ...baseItem, attemptCount: 0 },
      outcome: { status: "retry", error: "rate limited", retryAfterMs: 15_000 },
      maxAttempts: 5,
      now: fixedNow,
    });

    expect(res.state).toBe("pending");
    expect(res.attemptCount).toBe(1);
    expect(res.scheduledAt).toEqual(new Date("2026-10-09T12:00:15Z"));
  });

  it("handles retry outcome when attempt budget is exhausted: marks failed", () => {
    const res = computeOutboxTransition({
      item: { ...baseItem, attemptCount: 4 },
      outcome: { status: "retry", error: "gateway timeout" },
      maxAttempts: 5,
      now: fixedNow,
    });

    expect(res.state).toBe("failed");
    expect(res.attemptCount).toBe(5);
    expect(res.scheduledAt).toBeNull();
    expect(res.lastError).toBe("gateway timeout");
    expect(res.isExhaustedFailure).toBe(true);
    expect(res.isRescheduled).toBe(false);
  });

  it("handles terminal failed outcome: increments attempt and marks failed immediately", () => {
    const res = computeOutboxTransition({
      item: { ...baseItem, attemptCount: 0 },
      outcome: { status: "failed", error: "fatal configuration error", terminal: true },
      maxAttempts: 5,
      now: fixedNow,
    });

    expect(res.state).toBe("failed");
    expect(res.attemptCount).toBe(1);
    expect(res.scheduledAt).toBeNull();
    expect(res.lastError).toBe("fatal configuration error");
    expect(res.isExhaustedFailure).toBe(true);
  });
});
