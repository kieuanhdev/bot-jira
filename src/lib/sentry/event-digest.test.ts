import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/latest-event.json";
import type { SentryEvent } from "./client";
import { digestSentryEvent } from "./event-digest";

const event = fixture as unknown as SentryEvent;

describe("digestSentryEvent", () => {
  const digest = digestSentryEvent(event);

  it("uses the last exception in the exception entry", () => {
    expect(digest.exceptionType).toBe("TypeError");
    expect(digest.exceptionValue).toContain("Cannot read properties of undefined");
  });

  it("keeps at most 10 in-app frames, nearest to the crash first", () => {
    expect(digest.frames.length).toBe(10);
    expect(digest.frames.every((f) => !f.file.includes("node_modules"))).toBe(true);
    expect(digest.frames[0]).toEqual({ file: "app.services.payment", fn: "submitPayment", line: 88 });
    expect(digest.frames[1]).toEqual({ file: "app/screens/checkout-13.tsx", fn: "frame13", line: 23 });
  });

  it("strips the query string and fragment from requestUrl and the url tag", () => {
    expect(digest.requestUrl).toBe("https://app.example.com/checkout");
    expect(digest.tags.url).toBe("https://app.example.com/checkout");
  });

  it("whitelists tags and drops user / ip data", () => {
    expect(Object.keys(digest.tags).sort()).toEqual(
      ["browser", "environment", "os", "release", "transaction", "url"].sort()
    );
    expect(digest.tags["user.ip"]).toBeUndefined();
    expect(JSON.stringify(digest)).not.toContain("203.0.113.7");
  });

  it("redacts emails and secrets", () => {
    const json = JSON.stringify(digest);
    expect(json).not.toContain("user@example.com");
    expect(json).not.toContain("admin@example.com");
    expect(json).not.toContain("FAKEkey0123456789abcdef");
    expect(json).not.toContain("FAKEtoken");
    expect(digest.exceptionValue).toContain("[email]");
  });

  it("redacts emails in the message when there is no exception", () => {
    const d = digestSentryEvent({ eventID: "x", message: "Login failed for user@example.com" });
    expect(d.exceptionValue).toBe("Login failed for [email]");
    expect(d.frames).toEqual([]);
    expect(d.tags).toEqual({});
  });

  it("caps exceptionValue at 1000 characters", () => {
    const d = digestSentryEvent({
      eventID: "x",
      entries: [{ type: "exception", data: { values: [{ type: "Error", value: "a ".repeat(2000) }] } }],
    });
    expect(d.exceptionValue!.length).toBeLessThanOrEqual(1000);
  });

  it("tolerates malformed entries", () => {
    const d = digestSentryEvent({
      eventID: "x",
      entries: [
        { type: "exception", data: null },
        { type: "request", data: { url: 42 } },
      ],
    });
    expect(d).toEqual({ frames: [], tags: {} });
  });
});
