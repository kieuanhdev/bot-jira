import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { useShowMore } from "./use-show-more";

function TestShowMoreComponent({
  total,
  step,
  initial,
  onHookResult,
}: {
  total: number;
  step?: number;
  initial?: number;
  onHookResult?: (res: ReturnType<typeof useShowMore>) => void;
}) {
  const result = useShowMore(total, step, initial);
  onHookResult?.(result);
  return React.createElement(
    "div",
    {
      "data-visible": String(result.visibleCount),
      "data-has-more": String(result.hasMore),
    },
    `${result.visibleCount}/${total}`
  );
}

describe("useShowMore", () => {
  it("initializes with default count 50", () => {
    let hookResult = {} as ReturnType<typeof useShowMore>;
    const html = renderToString(
      React.createElement(TestShowMoreComponent, {
        total: 120,
        onHookResult: (res) => {
          hookResult = res;
        },
      })
    );
    expect(html).toContain('data-visible="50"');
    expect(html).toContain('data-has-more="true"');
    expect(hookResult.visibleCount).toBe(50);
    expect(hookResult.hasMore).toBe(true);
  });

  it("caps visibleCount to total when initial exceeds total", () => {
    let hookResult = {} as ReturnType<typeof useShowMore>;
    const html = renderToString(
      React.createElement(TestShowMoreComponent, {
        total: 30,
        initial: 50,
        onHookResult: (res) => {
          hookResult = res;
        },
      })
    );
    expect(html).toContain('data-visible="30"');
    expect(html).toContain('data-has-more="false"');
    expect(hookResult.visibleCount).toBe(30);
    expect(hookResult.rawVisibleCount).toBe(50);
    expect(hookResult.hasMore).toBe(false);
  });

  it("exposes showMore and reset callbacks", () => {
    let hookResult = {} as ReturnType<typeof useShowMore>;
    renderToString(
      React.createElement(TestShowMoreComponent, {
        total: 100,
        step: 25,
        initial: 25,
        onHookResult: (res) => {
          hookResult = res;
        },
      })
    );
    expect(typeof hookResult.showMore).toBe("function");
    expect(typeof hookResult.reset).toBe("function");
    expect(typeof hookResult.setVisibleCount).toBe("function");
  });
});
