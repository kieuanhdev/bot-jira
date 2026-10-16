"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

interface UseFocusTrapOptions {
  onEscape?: () => void;
  enabled?: boolean;
}

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  options: UseFocusTrapOptions = {}
) {
  const { onEscape, enabled = true } = options;

  const onEscapeEvent = useEffectEvent(() => {
    onEscape?.();
  });

  useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;

    node.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscapeEvent();
        return;
      }
      if (e.key === "Tab" && ref.current) {
        const focusables = ref.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || active === ref.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [enabled, ref]);
}
