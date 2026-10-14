import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Sparkline } from "./sparkline";

describe("Sparkline component", () => {
  it("renders empty fallback when data has fewer than 4 points (minPoints rule)", () => {
    const html = renderToStaticMarkup(
      React.createElement(Sparkline, { data: [10, 20, 30], minPoints: 4 })
    );
    expect(html).toBe('<span class="text-muted-foreground text-xs">—</span>');
    expect(html).not.toContain("<svg");
  });

  it("renders custom empty fallback when data has fewer than minPoints", () => {
    const html = renderToStaticMarkup(
      React.createElement(Sparkline, {
        data: [100],
        minPoints: 4,
        emptyFallback: React.createElement("span", null, "Chưa đủ dữ liệu"),
      })
    );
    expect(html).toBe("<span>Chưa đủ dữ liệu</span>");
    expect(html).not.toContain("<svg");
  });

  it("renders svg chart when data has 4 or more points", () => {
    const html = renderToStaticMarkup(
      React.createElement(Sparkline, { data: [10, 20, 15, 30], minPoints: 4 })
    );
    expect(html).toContain("<svg");
    expect(html).toContain('role="img"');
    expect(html).toContain("<path");
    expect(html).toContain("<circle");
  });

  it("supports object points with value property", () => {
    const data = [{ value: 10 }, { value: 20 }, { value: 30 }, { value: 40 }];
    const html = renderToStaticMarkup(React.createElement(Sparkline, { data }));
    expect(html).toContain("<svg");
  });

  it("applies tone colors and unit properly", () => {
    const html = renderToStaticMarkup(
      React.createElement(Sparkline, {
        data: [50, 60, 70, 80],
        unit: "ms",
        tone: "rose",
      })
    );
    expect(html).toContain("#f43f5e");
    expect(html).toContain("ms");
  });
});
