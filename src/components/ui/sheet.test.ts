import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Sheet } from "./sheet";

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => children,
  };
});

describe("Sheet", () => {
  it("renders closed without error", () => {
    const props = { open: false, onOpenChange: () => {}, title: "T", children: null };
    const html = renderToString(React.createElement(Sheet, props));
    expect(html).not.toContain("<h2");
  });

  it("omits close button when hideClose is true", () => {
    const props = { open: true, onOpenChange: () => {}, hideClose: true, children: null };
    const html = renderToString(React.createElement(Sheet, props));
    expect(html).not.toContain('aria-label="Đóng"');
  });

  it("renders close button when hideClose is false", () => {
    const props = { open: true, onOpenChange: () => {}, hideClose: false, children: null };
    const html = renderToString(React.createElement(Sheet, props));
    expect(html).toContain('aria-label="Đóng"');
  });
});
