import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VersionPickerDropdown } from "./version-picker-dropdown";

describe("VersionPickerDropdown", () => {
  it("renders trigger button with placeholder", () => {
    const html = renderToStaticMarkup(
      React.createElement(VersionPickerDropdown, {
        versions: [{ id: "1", name: "v1.0.0" }],
        onSelect: () => {},
      })
    );
    expect(html).toContain("Chọn version…");
  });

  it("renders custom placeholder and trigger class", () => {
    const html = renderToStaticMarkup(
      React.createElement(VersionPickerDropdown, {
        versions: [{ id: "1", name: "v1.0.0" }],
        onSelect: () => {},
        placeholder: "Chọn phiên bản",
        triggerClassName: "h-7 w-32",
      })
    );
    expect(html).toContain("Chọn phiên bản");
    expect(html).toContain("h-7 w-32");
  });
});
