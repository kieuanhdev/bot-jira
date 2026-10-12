import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

describe("logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["info", "warn", "error"] as const)("writes %s as one JSON line with level first", (level) => {
    const spy = vi.spyOn(console, level).mockImplementation(() => undefined);
    logger[level]({ message: "hello", job: "x", count: 2 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('{"level":"' + level + '","message":"hello","job":"x","count":2}');
  });
});
