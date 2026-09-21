import { describe, it, expect } from "vitest";
import { parseAiScore, parseReleaseCheck, buildScorePrompt, buildReleaseCheckPrompt } from "./prompts";

describe("parseAiScore", () => {
  it("parses clean JSON", () => {
    const r = parseAiScore('{"points":5,"reasoning":"medium","risks":["db migration"]}');
    expect(r.points).toBe(5);
    expect(r.reasoning).toBe("medium");
    expect(r.risks).toEqual(["db migration"]);
  });

  it("strips code fences", () => {
    const r = parseAiScore('```json\n{"points":3,"reasoning":"x","risks":[]}\n```');
    expect(r.points).toBe(3);
  });

  it("snaps off-scale points to nearest", () => {
    // default scale 1,2,3,5,8,13 -> 4 snaps to 3 or 5 (3 is closer to 4? |3-4|=1,|5-4|=1 -> picks first, 3)
    const r = parseAiScore('{"points":4,"reasoning":"x","risks":[]}');
    expect([3, 5]).toContain(r.points);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseAiScore("not json at all")).toThrow();
  });

  it("handles prose around JSON", () => {
    const r = parseAiScore('Sure, here you go: {"points":8,"reasoning":"big","risks":[]} hope that helps');
    expect(r.points).toBe(8);
  });
});

describe("parseReleaseCheck", () => {
  it("parses ready with blockers", () => {
    const r = parseReleaseCheck(
      '{"ready":false,"blockers":[{"jiraKey":"PROJ-1","reason":"db down"}]}',
      ["PROJ-1", "PROJ-2"]
    );
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual([{ jiraKey: "PROJ-1", reason: "db down" }]);
  });

  it("filters unknown keys", () => {
    const r = parseReleaseCheck(
      '{"ready":false,"blockers":[{"jiraKey":"NOPE-9","reason":"x"}]}',
      ["PROJ-1"]
    );
    expect(r.blockers).toEqual([]);
  });

  it("defaults to ready on garbage", () => {
    const r = parseReleaseCheck("nope", ["PROJ-1"]);
    expect(r.ready).toBe(true);
    expect(r.blockers).toEqual([]);
  });
});

describe("prompt builders", () => {
  it("score prompt lists the scale", () => {
    const p = buildScorePrompt({ key: "PROJ-1", summary: "s", description: "d" });
    expect(p).toContain("PROJ-1");
    expect(p).toContain("1/2/3/5/8/13");
  });
  it("release prompt lists tasks", () => {
    const p = buildReleaseCheckPrompt({ version: "1.0.0" }, [{ jiraKey: "PROJ-1", summary: "s", description: "d" }]);
    expect(p).toContain("PROJ-1");
    expect(p).toContain("1.0.0");
  });
});
