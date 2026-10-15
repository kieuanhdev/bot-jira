import { describe, expect, it } from "vitest";
import { BOARD_PERF_MARKS, BOARD_PERF_MEASURES } from "./use-board-perf-marks";

describe("BOARD_PERF_MARKS & BOARD_PERF_MEASURES", () => {
  it("defines expected performance mark names preserving timing convention", () => {
    expect(BOARD_PERF_MARKS.start).toBe("board:start");
    expect(BOARD_PERF_MARKS.bootstrapReady).toBe("board:bootstrap-ready");
    expect(BOARD_PERF_MARKS.issuesReady).toBe("board:issues-ready");
    expect(BOARD_PERF_MARKS.contentRendered).toBe("board:content-rendered");
  });

  it("defines expected performance measure names", () => {
    expect(BOARD_PERF_MEASURES.loadToIssues).toBe("board:load-to-issues");
    expect(BOARD_PERF_MEASURES.loadToContent).toBe("board:load-to-content");
  });
});
