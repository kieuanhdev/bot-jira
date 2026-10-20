import { describe, expect, it } from "vitest";
import { filterLocalOptions } from "./filter-options";

describe("filterLocalOptions", () => {
  it("matches case-insensitively and keeps order", () => {
    expect(filterLocalOptions(["anh", "Bình", "an"], "an", 8)).toEqual(["anh", "an"]);
    expect(filterLocalOptions(["Anh", "Bình"], "AN", 8)).toEqual(["Anh"]);
  });

  it("applies the limit", () => {
    expect(filterLocalOptions(["anh", "Bình", "an"], "an", 1)).toEqual(["anh"]);
  });

  it("returns the first options for an empty query", () => {
    expect(filterLocalOptions(["a", "b", "c"], "  ", 2)).toEqual(["a", "b"]);
  });
});
