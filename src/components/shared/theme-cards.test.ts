import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeCards } from "./theme-cards";

describe("ThemeCards", () => {
  it("renders light, dark, and system options with descriptions and radio roles", () => {
    const html = renderToStaticMarkup(React.createElement(ThemeCards));
    expect(html).toContain("Sáng");
    expect(html).toContain("Tối");
    expect(html).toContain("Theo hệ thống");
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="radio"');
    expect(html).toContain("Nền sáng");
    expect(html).toContain("Nền tối");
  });
});
