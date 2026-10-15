import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, logSwallowed } from "./logger";

describe("logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["info", "warn", "error"] as const)("writes %s as one JSON line with level first", (level) => {
    const spy = vi.spyOn(console, level).mockImplementation(() => undefined);
    logger[level]({ message: "hello", job: "x", count: 2 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('{"level":"' + level + '","message":"hello","job":"x","count":2}');
  });

  describe("logSwallowed", () => {
    it("logs swallowed Error at warn with name and message, without stack", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const err = new TypeError("invalid value");
      logSwallowed("health_alert", err, { target: "admin" });

      expect(spy).toHaveBeenCalledTimes(1);
      const logPayload = JSON.parse(spy.mock.calls[0][0]);
      expect(logPayload).toEqual({
        level: "warn",
        message: "swallowed error: health_alert",
        errorName: "TypeError",
        errorMessage: "invalid value",
        target: "admin",
      });
      expect(logPayload.stack).toBeUndefined();
    });

    it("handles non-Error thrown values", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      logSwallowed("webhook_enqueue", "network timeout");

      expect(spy).toHaveBeenCalledTimes(1);
      const logPayload = JSON.parse(spy.mock.calls[0][0]);
      expect(logPayload).toEqual({
        level: "warn",
        message: "swallowed error: webhook_enqueue",
        errorName: "UnknownError",
        errorMessage: "network timeout",
      });
    });
  });
});

