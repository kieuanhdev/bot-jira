import { describe, expect, it, beforeEach } from "vitest";
import { checkAuthRateLimit, _resetRateLimits } from "./rate-limit";

describe("checkAuthRateLimit", () => {
  beforeEach(() => {
    _resetRateLimits();
  });

  it("allows requests under the limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkAuthRateLimit("192.168.1.1", 5, 1000)).toBe(true);
    }
  });

  it("blocks requests once the limit is reached", () => {
    for (let i = 0; i < 5; i++) {
      checkAuthRateLimit("192.168.1.2", 5, 1000);
    }
    expect(checkAuthRateLimit("192.168.1.2", 5, 1000)).toBe(false);
  });

  it("isolates rate limits by IP address", () => {
    for (let i = 0; i < 3; i++) {
      checkAuthRateLimit("10.0.0.1", 3, 1000);
    }
    expect(checkAuthRateLimit("10.0.0.1", 3, 1000)).toBe(false);
    expect(checkAuthRateLimit("10.0.0.2", 3, 1000)).toBe(true);
  });

  it("limits unknown or empty identifiers instead of bypassing", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkAuthRateLimit("unknown", 5, 1000)).toBe(true);
    }
    expect(checkAuthRateLimit("unknown", 5, 1000)).toBe(false);

    _resetRateLimits();
    for (let i = 0; i < 5; i++) {
      expect(checkAuthRateLimit("", 5, 1000)).toBe(true);
    }
    expect(checkAuthRateLimit("", 5, 1000)).toBe(false);
  });

  it("enforces coarse global rate limit across different identifiers", () => {
    for (let i = 0; i < 15; i++) {
      expect(checkAuthRateLimit(`user-${i}`, 10, 1000, 15)).toBe(true);
    }
    // 16th attempt with a brand new user should be blocked by global bucket
    expect(checkAuthRateLimit("user-new", 10, 1000, 15)).toBe(false);
  });
});
