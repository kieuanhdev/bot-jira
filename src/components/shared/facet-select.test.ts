import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FacetSelect } from "./facet-select";
import { FacetMultiSelect } from "./facet-multi-select";

describe("FacetSelect", () => {
  it("renders trigger with allLabel when value is ALL", () => {
    const html = renderToStaticMarkup(
      React.createElement(FacetSelect, {
        value: "ALL",
        onChange: vi.fn(),
        allLabel: "Tất cả dự án",
        options: [
          { value: "PROJ1", label: "Project 1", count: 12 },
          { value: "PROJ2", label: "Project 2", count: 5 },
        ],
      })
    );
    expect(html).toContain("Tất cả dự án");
  });

  it("applies active styles when a specific option is selected", () => {
    const html = renderToStaticMarkup(
      React.createElement(FacetSelect, {
        value: "PROJ1",
        onChange: vi.fn(),
        allLabel: "Tất cả dự án",
        options: [{ value: "PROJ1", label: "Project 1" }],
      })
    );
    expect(html).toContain("border-primary/40");
  });
});

describe("FacetMultiSelect", () => {
  it("renders with 'Tất cả' label when selected is empty", () => {
    const html = renderToStaticMarkup(
      React.createElement(FacetMultiSelect, {
        title: "Trạng thái",
        options: ["Open", "In Progress", "Done"],
        selected: [],
        onChange: vi.fn(),
      })
    );
    expect(html).toContain("Tất cả trạng thái");
  });

  it("renders selected item label and badge count when items are selected", () => {
    const html = renderToStaticMarkup(
      React.createElement(FacetMultiSelect, {
        title: "Trạng thái",
        options: ["Open", "In Progress", "Done"],
        selected: ["Open", "Done"],
        onChange: vi.fn(),
      })
    );
    expect(html).toContain("Open");
    expect(html).toContain("+1");
    expect(html).toContain("Bỏ lọc trạng thái");
  });
});
