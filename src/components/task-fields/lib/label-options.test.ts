import { describe, expect, it } from "vitest";
import { MAX_LABELS_COUNT, MAX_LABEL_LENGTH } from "@/lib/bulk/create-types";
import { addLabel, buildLabelOptions } from "./label-options";

describe("buildLabelOptions", () => {
  it("offers the typed text as a new label first", () => {
    expect(buildLabelOptions("New", ["new-ui"], [])[0]).toEqual({ value: "New", isNew: true });
  });

  it("does not offer a new option when the input matches a suggestion", () => {
    const options = buildLabelOptions("new-ui", ["new-ui"], []);
    expect(options.some((o) => o.isNew)).toBe(false);
    expect(options).toEqual([{ value: "new-ui", isNew: false }]);
  });

  it("matches case-insensitively and hides selected labels", () => {
    expect(buildLabelOptions("NEW-UI", ["new-ui"], []).some((o) => o.isNew)).toBe(false);
    expect(buildLabelOptions("", ["a", "B"], ["b"])).toEqual([{ value: "a", isNew: false }]);
    expect(buildLabelOptions("B", [], ["b"])).toEqual([]);
  });

  it("trims input and skips over-long input", () => {
    expect(buildLabelOptions("  x  ", [], [])).toEqual([{ value: "x", isNew: true }]);
    expect(buildLabelOptions("a".repeat(MAX_LABEL_LENGTH + 1), [], [])).toEqual([]);
  });
});

describe("addLabel", () => {
  it("appends a trimmed label", () => {
    expect(addLabel(["A"], "  b ")).toEqual(["A", "b"]);
  });

  it("ignores case-insensitive duplicates and empty input", () => {
    expect(addLabel(["A"], "a")).toEqual(["A"]);
    expect(addLabel(["A"], "   ")).toEqual(["A"]);
  });

  it("ignores over-long labels", () => {
    expect(addLabel([], "a".repeat(MAX_LABEL_LENGTH + 1))).toEqual([]);
  });

  it("does not change the array once MAX_LABELS_COUNT is reached", () => {
    const full = Array.from({ length: MAX_LABELS_COUNT }, (_, i) => `l${i}`);
    expect(addLabel(full, "extra")).toEqual(full);
  });
});
