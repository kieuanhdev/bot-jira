"use client";

import * as React from "react";

/**
 * Subscribes to a CSS media query and returns whether it matches.
 * Uses `useSyncExternalStore` with server fallback for hydration safety.
 *
 * @param query CSS media query string, e.g. "(min-width: 768px)"
 * @param serverDefault Boolean returned during SSR / before mount (default: true)
 */
export function useMediaQuery(query: string, serverDefault = true): boolean {
  const subscribe = React.useCallback(
    (notify: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) {
        return () => {};
      }
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", notify);
      return () => {
        mediaQueryList.removeEventListener("change", notify);
      };
    },
    [query]
  );

  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return serverDefault;
    }
    return window.matchMedia(query).matches;
  }, [query, serverDefault]);

  const getServerSnapshot = React.useCallback(() => serverDefault, [serverDefault]);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
