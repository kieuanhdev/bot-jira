import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { useNotificationFilters } from "./use-notification-filters";

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/lib/url-state", () => ({
  replaceUrlState: (url: string) => mockReplace(url),
}));

function TestNotificationFiltersComponent({
  onHookResult,
}: {
  onHookResult: (res: ReturnType<typeof useNotificationFilters>) => void;
}) {
  const result = useNotificationFilters();
  onHookResult(result);
  return React.createElement("div", null, result.tab);
}

describe("useNotificationFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it("reads default values when searchParams are empty", () => {
    let hookResult = {} as ReturnType<typeof useNotificationFilters>;
    renderToString(
      React.createElement(TestNotificationFiltersComponent, {
        onHookResult: (res) => {
          hookResult = res;
        },
      })
    );

    expect(hookResult.tab).toBe("all");
    expect(hookResult.selectedType).toBe("all");
    expect(hookResult.severityFilter).toBe("all");
    expect(hookResult.searchQuery).toBe("");
    expect(hookResult.hasActiveFilters).toBe(false);
    expect(hookResult.unreadOnly).toBe(false);
    expect(hookResult.typeFilter).toBeUndefined();
  });

  it("reads parameters from URL properly", () => {
    mockSearchParams = new URLSearchParams("tab=unread&type=mention&severity=attention&q=PROJ-123");
    let hookResult = {} as ReturnType<typeof useNotificationFilters>;
    renderToString(
      React.createElement(TestNotificationFiltersComponent, {
        onHookResult: (res) => {
          hookResult = res;
        },
      })
    );

    expect(hookResult.tab).toBe("unread");
    expect(hookResult.selectedType).toBe("mention");
    expect(hookResult.severityFilter).toBe("attention");
    expect(hookResult.searchQuery).toBe("PROJ-123");
    expect(hookResult.hasActiveFilters).toBe(true);
    expect(hookResult.unreadOnly).toBe(true);
    expect(hookResult.typeFilter).toBe("mention");
  });

  it("updates tab and syncs to URL", () => {
    let hookResult = {} as ReturnType<typeof useNotificationFilters>;
    renderToString(
      React.createElement(TestNotificationFiltersComponent, {
        onHookResult: (res) => {
          hookResult = res;
        },
      })
    );

    hookResult.setTab("unread");
    expect(mockReplace).toHaveBeenCalledWith("/notifications?tab=unread");
  });

  it("removes tab when set to all", () => {
    mockSearchParams = new URLSearchParams("tab=read");
    let hookResult = {} as ReturnType<typeof useNotificationFilters>;
    renderToString(
      React.createElement(TestNotificationFiltersComponent, {
        onHookResult: (res) => {
          hookResult = res;
        },
      })
    );

    hookResult.setTab("all");
    expect(mockReplace).toHaveBeenCalledWith("/notifications");
  });

  it("resets all filters", () => {
    mockSearchParams = new URLSearchParams("tab=unread&type=mention&severity=attention&q=test");
    let hookResult = {} as ReturnType<typeof useNotificationFilters>;
    renderToString(
      React.createElement(TestNotificationFiltersComponent, {
        onHookResult: (res) => {
          hookResult = res;
        },
      })
    );

    hookResult.resetFilters();
    expect(mockReplace).toHaveBeenCalledWith("/notifications");
  });
});
