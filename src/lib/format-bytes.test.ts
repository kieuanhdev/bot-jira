import { describe, expect, it } from "vitest";
import { formatBytes } from "./format-bytes";

describe("formatBytes", () => {
  it("scales to the largest sensible unit", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(12 * 1024)).toBe("12 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("treats junk as empty", () => {
    expect(formatBytes(NaN)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
  });
});
