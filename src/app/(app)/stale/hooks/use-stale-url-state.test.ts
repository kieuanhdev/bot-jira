import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { useStaleUrlState } from "./use-stale-url-state";

// Mock next/navigation
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

import { ALL } from "../lib/stale-types";

function TestUrlStateComponent({
  onHookResult,
}: {
  onHookResult: (res: ReturnType<typeof useStaleUrlState>) => void;
}) {
  const result = useStaleUrlState();
  onHookResult(result);
  return React.createElement("div", null, result.viewMode);
}

describe("useStaleUrlState", () => {
  it("defaults to my-work and standardization when searchParams are empty", () => {
    mockSearchParams = new URLSearchParams();
    let hookResult = {} as ReturnType<typeof useStaleUrlState>;

    renderToString(
      React.createElement(TestUrlStateComponent, {
        onHookResult: (res) => {
          hookResult = res;
        },
      })
    );

    expect(hookResult.viewMode).toBe("my-work");
    expect(hookResult.activeTab).toBe("standardization");
    expect(hookResult.assignee).toBe("me");
    expect(hookResult.project).toBe(ALL);
    expect(hookResult.status).toBe(ALL);
    expect(hookResult.stdMissingFilter).toBe("ALL");
    expect(hookResult.stdStaleFilter).toBe("ALL");
    expect(hookResult.stdSort).toBe("missing-desc");
    expect(hookResult.stdSearch).toBe("");
  });

  it("reads parameters from searchParams accurately", () => {
    mockSearchParams = new URLSearchParams(
      "view=team&miss=ESTIMATION&proj=PROJ-1&sla=stale&sort=updated-desc&q=auth"
    );
    let hookResult = {} as ReturnType<typeof useStaleUrlState>;

    renderToString(
      React.createElement(TestUrlStateComponent, {
        onHookResult: (res) => {
          hookResult = res;
        },
      })
    );

    // Team view is disabled (TEAM_VIEW_ENABLED = false): ?view=team falls back to my-work.
    expect(hookResult.viewMode).toBe("my-work");
    expect(hookResult.assignee).toBe("me");
    expect(hookResult.stdMissingFilter).toBe("ESTIMATION");
    expect(hookResult.stdProjectFilter).toBe("PROJ-1");
    expect(hookResult.stdStaleFilter).toBe("stale");
    expect(hookResult.stdSort).toBe("updated-desc");
    expect(hookResult.stdSearch).toBe("auth");
  });

  it("falls back to safe defaults when unknown values are in URL", () => {
    mockSearchParams = new URLSearchParams(
      "view=invalid&miss=UNKNOWN&sla=unknown&sort=invalid"
    );
    let hookResult = {} as ReturnType<typeof useStaleUrlState>;

    renderToString(
      React.createElement(TestUrlStateComponent, {
        onHookResult: (res) => {
          hookResult = res;
        },
      })
    );

    expect(hookResult.viewMode).toBe("my-work");
    expect(hookResult.stdMissingFilter).toBe("ALL");
    expect(hookResult.stdStaleFilter).toBe("ALL");
    expect(hookResult.stdSort).toBe("missing-desc");
  });
});
