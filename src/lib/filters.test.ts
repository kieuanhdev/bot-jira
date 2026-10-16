import { describe, expect, it } from "vitest";
import { ALL, ALL_LOWER, isAllFilter } from "./filters";

describe("filters", () => {
  it("exports ALL and ALL_LOWER constants", () => {
    expect(ALL).toBe("ALL");
    expect(ALL_LOWER).toBe("all");
  });

  it("checks if a value represents all", () => {
    expect(isAllFilter(undefined)).toBe(true);
    expect(isAllFilter(null)).toBe(true);
    expect(isAllFilter("")).toBe(true);
    expect(isAllFilter("ALL")).toBe(true);
    expect(isAllFilter("all")).toBe(true);
    expect(isAllFilter("All")).toBe(true);
    expect(isAllFilter("project-1")).toBe(false);
  });
});
