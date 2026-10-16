import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaginationFooter } from "./pagination-footer";

describe("PaginationFooter", () => {
  it("renders null when hideOnSinglePage is true and totalPages <= 1", () => {
    const html = renderToStaticMarkup(
      React.createElement(PaginationFooter, {
        page: 1,
        totalPages: 1,
        onPageChange: vi.fn(),
      })
    );
    expect(html).toBe("");
  });

  it("renders pagination controls when totalPages > 1", () => {
    const html = renderToStaticMarkup(
      React.createElement(PaginationFooter, {
        page: 2,
        totalPages: 5,
        totalItems: 98,
        itemLabel: "task",
        onPageChange: vi.fn(),
      })
    );
    expect(html).toContain("Trang");
    expect(html).toContain("2");
    expect(html).toContain("5");
    expect(html).toContain("98");
    expect(html).toContain("task");
    expect(html).toContain("Trước");
    expect(html).toContain("Sau");
  });

  it("disables previous button on first page", () => {
    const html = renderToStaticMarkup(
      React.createElement(PaginationFooter, {
        page: 1,
        totalPages: 3,
        onPageChange: vi.fn(),
      })
    );
    expect(html).toContain('disabled=""');
  });

  it("disables next button on last page", () => {
    const html = renderToStaticMarkup(
      React.createElement(PaginationFooter, {
        page: 3,
        totalPages: 3,
        onPageChange: vi.fn(),
      })
    );
    expect(html).toContain('disabled=""');
  });
});
