import { describe, it, expect } from "vitest";
import {
  PRIORITIES,
  PRIORITY_RANK,
  PRIORITY_META,
  PRIORITY_NEUTRAL,
  isHighPriority,
  getPriorityRank,
} from "./priority";

describe("PRIORITIES and rankings", () => {
  it("contains the 6 canonical priorities in order from highest to lowest", () => {
    expect(PRIORITIES).toEqual([
      "Blocker",
      "Highest",
      "High",
      "Medium",
      "Low",
      "Lowest",
    ]);
  });

  it("assigns ascending rank numeric values from 0 to 5", () => {
    expect(PRIORITY_RANK.Blocker).toBe(0);
    expect(PRIORITY_RANK.Highest).toBe(1);
    expect(PRIORITY_RANK.High).toBe(2);
    expect(PRIORITY_RANK.Medium).toBe(3);
    expect(PRIORITY_RANK.Low).toBe(4);
    expect(PRIORITY_RANK.Lowest).toBe(5);
  });

  it("provides getPriorityRank with fallback for unknown or missing priorities", () => {
    expect(getPriorityRank("Blocker")).toBe(0);
    expect(getPriorityRank("Low")).toBe(4);
    expect(getPriorityRank(null)).toBe(999);
    expect(getPriorityRank(undefined)).toBe(999);
    expect(getPriorityRank("CustomUnknown")).toBe(999);
  });

  it("provides styling metadata for each priority", () => {
    expect(PRIORITY_META.Blocker.rail).toContain("bg-rose-500");
    expect(PRIORITY_META.Highest.rail).toContain("bg-rose-400");
    expect(PRIORITY_META.High.rail).toContain("bg-amber-500");
    expect(PRIORITY_META.Medium.rail).toContain("bg-sky-400");
    expect(PRIORITY_META.Low.rail).toContain("bg-slate-300");
    expect(PRIORITY_META.Lowest.rail).toContain("bg-slate-300");
    expect(PRIORITY_NEUTRAL.rail).toBe("bg-transparent");
  });

  it("isHighPriority identifies Blocker, Highest, and High correctly", () => {
    expect(isHighPriority("Blocker")).toBe(true);
    expect(isHighPriority("Highest")).toBe(true);
    expect(isHighPriority("High")).toBe(true);
    expect(isHighPriority("Medium")).toBe(false);
    expect(isHighPriority("Low")).toBe(false);
    expect(isHighPriority("Lowest")).toBe(false);
    expect(isHighPriority(null)).toBe(false);
    expect(isHighPriority(undefined)).toBe(false);
  });
});
