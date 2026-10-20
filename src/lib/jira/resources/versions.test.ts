import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createVersionResource } from "./versions";

describe("createVersionResource", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends releaseDate as 2026-10-10 when released at 2026-10-09T18:00:00Z", async () => {
    vi.setSystemTime(new Date("2026-10-09T18:00:00Z"));
    const requestMock = vi.fn().mockResolvedValue({ id: "v1", released: true });
    const resource = createVersionResource(requestMock);

    await resource.releaseVersion("v1");

    expect(requestMock).toHaveBeenCalledWith(
      "/rest/api/2/version/v1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          released: true,
          releaseDate: "2026-10-10",
        }),
      })
    );
  });
});
