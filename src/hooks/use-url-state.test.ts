import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { useUrlState } from "./use-url-state";

// Mock next/navigation
const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockPathname = "/reports/projects";
const mockSearchParams = new URLSearchParams("tab=tasks&period=this_week");

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

function TestComponent({
  onHookResult,
}: {
  onHookResult: (res: ReturnType<typeof useUrlState>) => void;
}) {
  const result = useUrlState();
  onHookResult(result);
  return React.createElement("div", null, "test");
}

describe("useUrlState", () => {
  it("reads pathname and searchParams from next/navigation", () => {
    let result = {} as ReturnType<typeof useUrlState>;
    renderToString(
      React.createElement(TestComponent, {
        onHookResult: (res) => {
          result = res;
        },
      })
    );

    expect(result.pathname).toBe("/reports/projects");
    expect(result.searchParams.get("tab")).toBe("tasks");
    expect(result.searchParams.get("period")).toBe("this_week");
  });

  it("updates URL with replace by default when params change", () => {
    mockReplace.mockClear();
    let result = {} as ReturnType<typeof useUrlState>;
    renderToString(
      React.createElement(TestComponent, {
        onHookResult: (res) => {
          result = res;
        },
      })
    );

    const changed = result.updateUrl((p) => {
      p.set("activity", "completed");
    });

    expect(changed).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith(
      "/reports/projects?tab=tasks&period=this_week&activity=completed",
      { scroll: false }
    );
  });

  it("does not navigate when query params remain identical", () => {
    mockReplace.mockClear();
    let result = {} as ReturnType<typeof useUrlState>;
    renderToString(
      React.createElement(TestComponent, {
        onHookResult: (res) => {
          result = res;
        },
      })
    );

    const changed = result.updateUrl(() => {
      // no change to existing tab=tasks&period=this_week
    });

    expect(changed).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
