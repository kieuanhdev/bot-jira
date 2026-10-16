import { describe, expect, it, vi, beforeEach } from "vitest";
import { api, ApiError, getErrorMessage } from "./api-client";

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

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("serializes plain object body to JSON exactly once", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await api<{ success: boolean }>("/api/admin/outbox/retry", {
      method: "POST",
      body: { ids: ["x"] },
    });

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("/api/admin/outbox/retry");
    expect(calledInit.method).toBe("POST");
    expect(calledInit.headers).toEqual({ "Content-Type": "application/json" });
    // Verify it is serialized exactly once as valid JSON
    expect(calledInit.body).toBe('{"ids":["x"]}');
  });

  it("disallows string values as body at compile time", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // @ts-expect-error string must not be assignable to body (body?: object)
    await api("/api/test", { method: "POST", body: "invalid-string-body" });
  });

  it("returns undefined on HTTP 204 No Content without parsing JSON", async () => {
    const jsonSpy = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: jsonSpy,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await api("/api/no-content", { method: "DELETE" });
    expect(result).toBeUndefined();
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("throws ApiError carrying status and error message on non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "permission_denied" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/api/protected")).rejects.toThrow(ApiError);
    try {
      await api("/api/protected");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.message).toBe("permission_denied");
      expect(apiErr.name).toBe("ApiError");
    }
  });

  it("handles non-ok response when error body is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("bad json");
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await api("/api/bad-gateway");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(502);
      expect(apiErr.message).toBe("Request failed (502)");
    }
  });
});
