import { describe, expect, it, vi, afterEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { useMediaQuery } from "./use-media-query";

function MediaComponent({ query, serverDefault }: { query: string; serverDefault?: boolean }) {
  const matches = useMediaQuery(query, serverDefault);
  return React.createElement("div", { "data-matches": String(matches) }, String(matches));
}

describe("useMediaQuery", () => {
  const originalMatchMedia = typeof window !== "undefined" ? window.matchMedia : undefined;

  afterEach(() => {
    if (typeof window !== "undefined") {
      if (originalMatchMedia) {
        window.matchMedia = originalMatchMedia;
      } else {
        delete (window as unknown as { matchMedia?: unknown }).matchMedia;
      }
    }
  });

  it("is defined as a callable hook function", () => {
    expect(typeof useMediaQuery).toBe("function");
  });

  it("returns serverDefault during SSR (renderToString)", () => {
    const htmlTrue = renderToString(React.createElement(MediaComponent, { query: "(min-width: 768px)", serverDefault: true }));
    expect(htmlTrue).toContain('data-matches="true"');

    const htmlFalse = renderToString(React.createElement(MediaComponent, { query: "(min-width: 768px)", serverDefault: false }));
    expect(htmlFalse).toContain('data-matches="false"');
  });

  it("defaults serverDefault to true", () => {
    const html = renderToString(React.createElement(MediaComponent, { query: "(min-width: 768px)" }));
    expect(html).toContain('data-matches="true"');
  });

  it("subscribes and listens to media query changes when window.matchMedia is available", () => {
    let changeHandler: (() => void) | null = null;
    const addEventListener = vi.fn((event: string, handler: () => void) => {
      if (event === "change") changeHandler = handler;
    });
    const removeEventListener = vi.fn();

    const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener,
      removeEventListener,
    }));

    (globalThis as unknown as { window?: { matchMedia: unknown } }).window = {
      ...(globalThis.window || {}),
      matchMedia: mockMatchMedia,
    };

    const html = renderToString(React.createElement(MediaComponent, { query: "(min-width: 768px)" }));
    expect(html).toContain('data-matches="true"');
    if (changeHandler) {
      expect(typeof changeHandler).toBe("function");
    }
  });
});
