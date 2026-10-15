import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("returns empty array when given empty input", async () => {
    const res = await mapWithConcurrency([], 3, async (x) => x);
    expect(res).toEqual([]);
  });

  it("preserves item order in results", async () => {
    const items = [10, 5, 20, 1];
    const res = await mapWithConcurrency(items, 2, async (delay, index) => {
      await new Promise((r) => setTimeout(r, delay));
      return `item-${index}:${delay}`;
    });

    expect(res).toEqual([
      "item-0:10",
      "item-1:5",
      "item-2:20",
      "item-3:1",
    ]);
  });

  it("enforces maximum concurrency limit", async () => {
    let running = 0;
    let maxRunning = 0;
    const items = [1, 2, 3, 4, 5, 6];

    await mapWithConcurrency(items, 3, async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
    });

    expect(maxRunning).toBe(3);
  });

  it("propagates worker rejection", async () => {
    const items = [1, 2, 3];
    await expect(
      mapWithConcurrency(items, 2, async (item) => {
        if (item === 2) throw new Error("Worker failed");
        return item;
      })
    ).rejects.toThrow("Worker failed");
  });
});
