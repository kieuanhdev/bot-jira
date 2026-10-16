import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { StandardizationTask } from "../lib/stale-types";

const defaultReturnTo = encodeURIComponent("/stale?view=my-work&tab=standardization");

export interface UseStdKeyboardNavOptions {
  keys: string[];
  tasks: StandardizationTask[];
  onToggleSelect: (key: string) => void;
  returnToUrl?: string;
}

export function useStdKeyboardNav({
  keys,
  tasks,
  onToggleSelect,
  returnToUrl = defaultReturnTo,
}: UseStdKeyboardNavOptions) {
  const router = useRouter();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const move = useCallback(
    (delta: number) => {
      if (keys.length === 0) return;
      const current = activeKey ? keys.indexOf(activeKey) : -1;
      const next = keys[Math.min(keys.length - 1, Math.max(0, current + delta))];
      setActiveKey(next);
      document
        .querySelector(`[data-task-row="${CSS.escape(next)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    },
    [activeKey, keys]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) ||
          el.closest("[role=dialog],[role=listbox],[role=menu]"))
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "j") {
        move(1);
      } else if (key === "k") {
        move(-1);
      } else if (key === "/") {
        const search = document.querySelector<HTMLInputElement>(
          '[aria-label="Tìm trong task chuẩn hóa"]'
        );
        if (search) {
          e.preventDefault();
          search.focus();
        }
      } else if (activeKey && (key === "x" || key === " ")) {
        e.preventDefault();
        onToggleSelect(activeKey);
      } else if (activeKey && (key === "o" || key === "enter")) {
        router.push(`/issue/${activeKey}`);
      } else if (activeKey && key === "p") {
        const input = Array.from(
          document.querySelectorAll<HTMLInputElement>(
            `[data-quick-points="${CSS.escape(activeKey)}"]`
          )
        ).find((node) => node.offsetParent !== null);
        if (input) {
          e.preventDefault();
          input.focus();
        }
      } else if (activeKey && key === "w") {
        const task = tasks.find((t) => t.jiraKey === activeKey);
        if (task?.missing.includes("WORKLOG")) {
          router.push(`/issue/${activeKey}?action=log-work&returnTo=${returnToUrl}`);
        }
      } else if (key === "escape") {
        setActiveKey(null);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeKey, move, onToggleSelect, router, tasks, returnToUrl]);

  return {
    activeKey,
    setActiveKey,
  };
}
