import { describe, it, expect } from "vitest";
import {
  parseAiScore,
  parseReleaseCheck,
  buildScorePrompt,
  buildReleaseCheckPrompt,
  AI_PROMPT_VERSION,
} from "./prompts";

describe("parseAiScore (M7)", () => {
  it("parses clean JSON with the new schema", () => {
    const r = parseAiScore(
      '{"suggestedPoints":5,"confidence":0.72,"reasoning":"medium","missingInformation":["Acceptance criteria"],"risks":["db migration"],"similarTasks":["PROJ-101"]}'
    );
    expect(r.suggestedPoints).toBe(5);
    expect(r.confidence).toBeCloseTo(0.72);
    expect(r.reasoning).toBe("medium");
    expect(r.missingInformation).toEqual(["Acceptance criteria"]);
    expect(r.risks).toEqual(["db migration"]);
    expect(r.similarTasks).toEqual(["PROJ-101"]);
  });

  it("strips code fences", () => {
    const r = parseAiScore('```json\n{"suggestedPoints":3,"confidence":0.9,"reasoning":"x","missingInformation":[],"risks":[],"similarTasks":[]}\n```');
    expect(r.suggestedPoints).toBe(3);
    expect(r.confidence).toBe(0.9);
  });

  it("snaps off-scale points to nearest", () => {
    // default scale 1,2,3,5,8,13 -> 4 snaps to 3 or 5
    const r = parseAiScore('{"suggestedPoints":4,"confidence":0.5,"reasoning":"x","missingInformation":[],"risks":[],"similarTasks":[]}');
    expect([3, 5]).toContain(r.suggestedPoints);
  });

  it("clamps confidence into 0..1 and defaults to 0.5 when absent", () => {
    expect(parseAiScore('{"suggestedPoints":3,"confidence":1.7,"reasoning":"x","missingInformation":[],"risks":[],"similarTasks":[]}').confidence).toBe(1);
    expect(parseAiScore('{"suggestedPoints":3,"confidence":-0.2,"reasoning":"x","missingInformation":[],"risks":[],"similarTasks":[]}').confidence).toBe(0);
    expect(parseAiScore('{"suggestedPoints":3,"reasoning":"x","missingInformation":[],"risks":[],"similarTasks":[]}').confidence).toBe(0.5);
  });

  it("throws when points are missing (no fake estimate)", () => {
    expect(() => parseAiScore('{"reasoning":"no points"}')).toThrow();
  });

  it("throws on invalid JSON", () => {
    expect(() => parseAiScore("not json at all")).toThrow();
  });

  it("handles prose around JSON", () => {
    const r = parseAiScore('Sure: {"suggestedPoints":8,"confidence":0.6,"reasoning":"big","missingInformation":[],"risks":[],"similarTasks":[]} hope that helps');
    expect(r.suggestedPoints).toBe(8);
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

describe("prompt builders (M7)", () => {
  it("score prompt lists the scale", () => {
    const p = buildScorePrompt({ key: "PROJ-1", summary: "s", description: "d" });
    expect(p).toContain("PROJ-1");
    expect(p).toContain("1/2/3/5/8/13");
  });

  it("score prompt includes normalized input sections", () => {
    const p = buildScorePrompt({
      key: "PROJ-1",
      summary: "s",
      description: "d",
      type: "Story",
      priority: "High",
      impact: { backend: true, mobile: true, migration: true },
      acceptanceCriteria: ["AC 1", "AC 2"],
      dependencies: ["PROJ-2"],
      similarTasks: [{ key: "PROJ-10", points: 3, summary: "similar thing" }],
    });
    expect(p).toContain("Acceptance criteria");
    expect(p).toContain("- AC 1");
    expect(p).toContain("PROJ-2");
    expect(p).toContain("backend");
    expect(p).toContain("mobile");
    expect(p).toContain("db-migration");
    expect(p).toContain("- PROJ-10 [3pt] similar thing");
  });

  it("release prompt lists tasks", () => {
    const p = buildReleaseCheckPrompt({ version: "1.0.0" }, [{ jiraKey: "PROJ-1", summary: "s", description: "d" }]);
    expect(p).toContain("PROJ-1");
    expect(p).toContain("1.0.0");
  });

  it("exposes a stable prompt version", () => {
    expect(AI_PROMPT_VERSION).toMatch(/estimate-v\d+/);
  });
});
