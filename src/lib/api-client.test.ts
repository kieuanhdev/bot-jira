import { describe, expect, it } from "vitest";
import { ApiError, getErrorMessage } from "./api-client";

describe("getErrorMessage", () => {
  it("returns the ApiError message", () => {
    expect(getErrorMessage(new ApiError("Không có quyền truy cập", 403))).toBe("Không có quyền truy cập");
  });

  it("returns a plain Error message", () => {
    expect(getErrorMessage(new Error("Network down"))).toBe("Network down");
  });

  it("returns a non-empty string as-is", () => {
    expect(getErrorMessage("Boom")).toBe("Boom");
  });

  it("falls back for null and undefined", () => {
    expect(getErrorMessage(null)).toBe("Đã xảy ra lỗi");
    expect(getErrorMessage(undefined)).toBe("Đã xảy ra lỗi");
  });

  it("falls back for an empty or whitespace-only string", () => {
    expect(getErrorMessage("")).toBe("Đã xảy ra lỗi");
    expect(getErrorMessage("   ")).toBe("Đã xảy ra lỗi");
  });

  it("falls back for a plain object", () => {
    expect(getErrorMessage({ error: "x" })).toBe("Đã xảy ra lỗi");
  });

  it("respects a custom fallback", () => {
    expect(getErrorMessage(null, "Oops")).toBe("Oops");
  });
});
