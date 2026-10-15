"use client";

import { useEffect, useRef } from "react";

export const BOARD_PERF_MARKS = {
  start: "board:start",
  bootstrapReady: "board:bootstrap-ready",
  issuesReady: "board:issues-ready",
  contentRendered: "board:content-rendered",
} as const;

export const BOARD_PERF_MEASURES = {
  loadToIssues: "board:load-to-issues",
  loadToContent: "board:load-to-content",
} as const;

export interface UseBoardPerfMarksParams {
  initialBootstrap: unknown;
  hasIssueData: boolean;
  columnsCount: number;
  issuesCount: number;
}

export function useBoardPerfMarks({
  initialBootstrap,
  hasIssueData,
  columnsCount,
  issuesCount,
}: UseBoardPerfMarksParams) {
  useEffect(() => {
    if (typeof performance !== "undefined" && performance.mark) {
      performance.mark("board:start");
      if (initialBootstrap) {
        performance.mark("board:bootstrap-ready");
      }
    }
  }, [initialBootstrap]);

  const markedIssuesRef = useRef(false);
  useEffect(() => {
    if (hasIssueData && !markedIssuesRef.current) {
      markedIssuesRef.current = true;
      if (typeof performance !== "undefined" && performance.mark) {
        performance.mark("board:issues-ready");
        try {
          performance.measure("board:load-to-issues", "board:start", "board:issues-ready");
        } catch {
          // ignore
        }
      }
    }
  }, [hasIssueData]);

  const markedContentRef = useRef(false);
  useEffect(() => {
    if ((columnsCount > 0 || issuesCount > 0) && !markedContentRef.current) {
      markedContentRef.current = true;
      if (typeof performance !== "undefined" && performance.mark) {
        performance.mark("board:content-rendered");
        try {
          performance.measure("board:load-to-content", "board:start", "board:content-rendered");
        } catch {
          // ignore
        }
      }
    }
  }, [columnsCount, issuesCount]);
}
