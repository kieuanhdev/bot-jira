import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  it("renders light, dark, and system options when THEME_TOGGLE_ENABLED is true", () => {
    const html = renderToStaticMarkup(React.createElement(ThemeToggle));
    expect(html).toContain("Sáng");
    expect(html).toContain("Tối");
    expect(html).toContain("Theo hệ thống");
    expect(html).toContain('role="group"');
  });
});
