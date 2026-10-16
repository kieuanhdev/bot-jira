import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { useFlashMessage } from "./use-flash-message";

function TestComponent({ initial }: { initial?: string }) {
  const { message } = useFlashMessage();
  return React.createElement("div", { "data-testid": "flash" }, message ?? initial ?? "empty");
}

describe("useFlashMessage", () => {
  it("is defined as a callable hook function", () => {
    expect(typeof useFlashMessage).toBe("function");
  });

  it("renders with null initial message by default", () => {
    const html = renderToString(React.createElement(TestComponent, {}));
    expect(html).toContain("empty");
  });

  it("returns message, show, clear, and setMessage handlers", () => {
    function Capture() {
      const hook = useFlashMessage();
      return React.createElement(
        "div",
        {
          "data-message": String(hook.message),
          "data-has-show": typeof hook.show === "function",
          "data-has-clear": typeof hook.clear === "function",
          "data-has-set": typeof hook.setMessage === "function",
        },
        "hook-ok"
      );
    }
    const html = renderToString(React.createElement(Capture));
    expect(html).toContain('data-message="null"');
    expect(html).toContain('data-has-show="true"');
    expect(html).toContain('data-has-clear="true"');
    expect(html).toContain('data-has-set="true"');
  });
});
