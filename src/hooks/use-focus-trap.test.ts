import { describe, expect, it } from "vitest";
import React, { useRef } from "react";
import { renderToString } from "react-dom/server";
import { useFocusTrap } from "./use-focus-trap";

function TestTrap({ enabled }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(ref, { enabled });
  return React.createElement("div", { ref }, "trapped");
}

describe("useFocusTrap", () => {
  it("is defined as a function", () => {
    expect(typeof useFocusTrap).toBe("function");
  });

  it("renders without error in SSR context", () => {
    const html = renderToString(React.createElement(TestTrap, { enabled: true }));
    expect(html).toContain("trapped");
  });
});
