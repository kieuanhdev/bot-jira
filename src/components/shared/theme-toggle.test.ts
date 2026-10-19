import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  it("renders null when THEME_TOGGLE_ENABLED is false", () => {
    const html = renderToStaticMarkup(React.createElement(ThemeToggle));
    expect(html).toBe("");
  });
});
