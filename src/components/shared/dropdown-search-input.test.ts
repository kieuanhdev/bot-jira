import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DropdownSearchInput } from "./dropdown-search-input";

describe("DropdownSearchInput", () => {
  it("renders with default placeholder and aria-label", () => {
    const html = renderToStaticMarkup(
      React.createElement(DropdownSearchInput, {
        value: "",
        onChange: () => {},
      })
    );
    expect(html).toContain('placeholder="Tìm kiếm…"');
    expect(html).toContain('aria-label="Tìm kiếm"');
  });

  it("renders custom placeholder and value", () => {
    const html = renderToStaticMarkup(
      React.createElement(DropdownSearchInput, {
        value: "alice",
        onChange: () => {},
        placeholder: "Tìm người…",
      })
    );
    expect(html).toContain('placeholder="Tìm người…"');
    expect(html).toContain('value="alice"');
    expect(html).toContain('aria-label="Xóa tìm kiếm"');
  });

  it("does not render clear button when value is empty", () => {
    const html = renderToStaticMarkup(
      React.createElement(DropdownSearchInput, {
        value: "",
        onChange: () => {},
      })
    );
    expect(html).not.toContain('aria-label="Xóa tìm kiếm"');
  });
});
