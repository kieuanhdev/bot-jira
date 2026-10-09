import { useEffect } from "react";
import type { IssueItem } from "@/hooks/use-issues";
import type { ViewMode } from "./board-types";

interface BoardKeyboardNavOptions {
  effectiveView: ViewMode;
  focusOrder: string[];
  issues: IssueItem[];
  cardRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
  focusKey: string | null;
  setFocusKey: (key: string | null) => void;
  onOpenQuickPanel: (issue: IssueItem) => void;
}

export type BoardNavigationKey = "ArrowRight" | "ArrowLeft" | "ArrowDown" | "ArrowUp" | "Home" | "End";

export function nextBoardFocusKey(
  focusOrder: string[],
  focusKey: string | null,
  key: BoardNavigationKey
): string | null {
  if (focusOrder.length === 0) return null;
  const index = focusKey ? focusOrder.indexOf(focusKey) : -1;
  if (key === "Home") return focusOrder[0];
  if (key === "End") return focusOrder[focusOrder.length - 1];
  if (index === -1) {
    return key === "ArrowLeft" || key === "ArrowUp"
      ? focusOrder[focusOrder.length - 1]
      : focusOrder[0];
  }
  const nextIndex =
    key === "ArrowRight" || key === "ArrowDown"
      ? Math.min(focusOrder.length - 1, index + 1)
      : Math.max(0, index - 1);
  return focusOrder[nextIndex];
}

/**
 * Handles arrow keys, Home/End, and Enter navigation across cards on the Kanban board.
 */
export function useBoardKeyboardNav({
  effectiveView,
  focusOrder,
  issues,
  cardRefs,
  focusKey,
  setFocusKey,
  onOpenQuickPanel,
}: BoardKeyboardNavOptions) {
  useEffect(() => {
    if (effectiveView !== "board" || focusOrder.length === 0) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;
      const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];
      if (!keys.includes(e.key) && e.key !== "Enter" && e.key !== "Home" && e.key !== "End") return;

      const idx = focusKey ? focusOrder.indexOf(focusKey) : -1;
      if (e.key === "Enter") {
        if (idx === -1) return;
        const issue = issues.find((i) => i.jiraKey === focusOrder[idx]);
        if (issue) {
          e.preventDefault();
          onOpenQuickPanel(issue);
        }
        return;
      }
      e.preventDefault();
      const key = nextBoardFocusKey(focusOrder, focusKey, e.key as BoardNavigationKey);
      if (!key) return;
      setFocusKey(key);
      const node = cardRefs.current.get(key);
      if (node) {
        node.focus({ preventScroll: true });
        node.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [effectiveView, focusOrder, focusKey, issues, cardRefs, onOpenQuickPanel, setFocusKey]);
}
