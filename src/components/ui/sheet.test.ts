import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Sheet } from "./sheet";

describe("Sheet", () => {
  it("renders closed without error", () => {
    const props = { open: false, onOpenChange: () => {}, title: "T", children: null };
    const html = renderToString(React.createElement(Sheet, props));
    expect(html).not.toContain("<h2");
  });
});
