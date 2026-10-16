import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { useDebouncedValue } from "./use-debounced-value";

function TestComponent({ value, delay }: { value: string; delay?: number }) {
  const debounced = useDebouncedValue(value, delay);
  return React.createElement("div", { "data-testid": "debounced" }, debounced);
}

describe("useDebouncedValue", () => {
  it("is defined as a callable hook function", () => {
    expect(typeof useDebouncedValue).toBe("function");
  });

  it("renders with the initial value on first render", () => {
    const html = renderToString(React.createElement(TestComponent, { value: "initial" }));
    expect(html).toContain("initial");
  });

  it("supports custom delay parameters", () => {
    const html = renderToString(React.createElement(TestComponent, { value: "custom-delay", delay: 500 }));
    expect(html).toContain("custom-delay");
  });
});
