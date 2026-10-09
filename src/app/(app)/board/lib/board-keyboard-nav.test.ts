import { describe, expect, it } from "vitest";
import { nextBoardFocusKey } from "./board-keyboard-nav";

describe("board keyboard navigation model", () => {
  const order = ["EPM-1", "EPM-2", "EPM-3"];

  it("starts at the nearest edge based on arrow direction", () => {
    expect(nextBoardFocusKey(order, null, "ArrowRight")).toBe("EPM-1");
    expect(nextBoardFocusKey(order, null, "ArrowUp")).toBe("EPM-3");
  });

  it("moves linearly and stops at the edges", () => {
    expect(nextBoardFocusKey(order, "EPM-2", "ArrowDown")).toBe("EPM-3");
    expect(nextBoardFocusKey(order, "EPM-3", "ArrowRight")).toBe("EPM-3");
    expect(nextBoardFocusKey(order, "EPM-1", "ArrowLeft")).toBe("EPM-1");
  });

  it("supports Home and End regardless of current focus", () => {
    expect(nextBoardFocusKey(order, "EPM-2", "Home")).toBe("EPM-1");
    expect(nextBoardFocusKey(order, null, "End")).toBe("EPM-3");
  });

  it("returns null for an empty board", () => {
    expect(nextBoardFocusKey([], null, "ArrowDown")).toBeNull();
  });
});
