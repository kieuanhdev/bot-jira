import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { pickAttachment, isProxiableImage } = await import("./attachment-route-service");

describe("pickAttachment", () => {
  it("prefers the newest exact filename match", () => {
    const picked = pickAttachment(
      [
        { id: "1", filename: "image.png", created: "2026-01-01T00:00:00.000+0700" },
        { id: "2", filename: "image.png", created: "2026-03-01T00:00:00.000+0700" },
        { id: "3", filename: "IMAGE.png", created: "2026-05-01T00:00:00.000+0700" },
      ],
      "image.png"
    );
    expect(picked?.id).toBe("2");
  });

  it("falls back to a case-insensitive match", () => {
    expect(pickAttachment([{ id: "9", filename: "Shot.PNG" }], "shot.png")?.id).toBe("9");
  });

  it("returns null when nothing matches", () => {
    expect(pickAttachment([{ id: "1", filename: "a.png" }], "b.png")).toBeNull();
  });
});

describe("isProxiableImage", () => {
  it("allows raster images and rejects svg and non-images", () => {
    expect(isProxiableImage("image/png")).toBe(true);
    expect(isProxiableImage("image/jpeg; charset=binary")).toBe(true);
    expect(isProxiableImage("image/svg+xml")).toBe(false);
    expect(isProxiableImage("application/pdf")).toBe(false);
    expect(isProxiableImage(undefined)).toBe(false);
  });
});
