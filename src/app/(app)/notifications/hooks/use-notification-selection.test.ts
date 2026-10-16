import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { useNotificationSelection } from "./use-notification-selection";

function TestNotificationSelectionComponent({
  filteredIds,
  onHookResult,
}: {
  filteredIds: string[];
  onHookResult: (res: ReturnType<typeof useNotificationSelection>) => void;
}) {
  const result = useNotificationSelection({ filteredIds });
  onHookResult(result);
  return React.createElement("div", null, result.selectedCount.toString());
}

describe("useNotificationSelection", () => {
  it("initializes with empty selection", () => {
    let hookResult = {} as ReturnType<typeof useNotificationSelection>;
    renderToString(
      React.createElement(TestNotificationSelectionComponent, {
        filteredIds: ["1", "2", "3"],
        onHookResult: (res) => {
          hookResult = res;
        },
      })
    );

    expect(hookResult.selectedCount).toBe(0);
    expect(hookResult.isAllSelected).toBe(false);
    expect(hookResult.selectedIds.size).toBe(0);
  });
});
