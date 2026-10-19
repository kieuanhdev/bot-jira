"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  applyTheme,
  getStoredThemePref,
  resolveTheme,
  setStoredThemePref,
  THEME_STORAGE_KEY,
  type ThemePref,
  type ThemeResolved,
} from "@/lib/theme";

export type { ThemePref, ThemeResolved } from "@/lib/theme";

// --- React External Store for useTheme ---

type ThemeSnapshot = {
  theme: ThemePref;
  resolvedTheme: ThemeResolved;
};

const SERVER_SNAPSHOT: ThemeSnapshot = {
  theme: "light",
  resolvedTheme: "light",
};

let cachedSnapshot: ThemeSnapshot | null = null;
const listeners = new Set<() => void>();

function getClientSnapshot(): ThemeSnapshot {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;

  const pref = getStoredThemePref();
  const systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)").matches : false;
  const resolved = resolveTheme(pref, systemDark);

  if (
    !cachedSnapshot ||
    cachedSnapshot.theme !== pref ||
    cachedSnapshot.resolvedTheme !== resolved
  ) {
    cachedSnapshot = { theme: pref, resolvedTheme: resolved };
  }
  return cachedSnapshot;
}

function notifyListeners() {
  cachedSnapshot = null;
  listeners.forEach((listener) => listener());
}

function subscribeTheme(notify: () => void): () => void {
  listeners.add(notify);

  if (typeof window === "undefined") {
    return () => listeners.delete(notify);
  }

  function handleStorage(e: StorageEvent) {
    if (e.key === THEME_STORAGE_KEY) {
      applyTheme(getStoredThemePref());
      notifyListeners();
    }
  }

  window.addEventListener("storage", handleStorage);

  let mqlUnsub: (() => void) | undefined;
  if (window.matchMedia) {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMql = () => {
      if (getStoredThemePref() === "system") {
        applyTheme("system");
        notifyListeners();
      }
    };
    mql.addEventListener("change", handleMql);
    mqlUnsub = () => mql.removeEventListener("change", handleMql);
  }

  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", handleStorage);
    mqlUnsub?.();
  };
}

/**
 * Hook to access and update the current theme preference and resolved theme.
 * Hydration-safe using useSyncExternalStore.
 */
export function useTheme() {
  const mounted = useSyncExternalStore(
    subscribeTheme,
    () => true,
    () => false
  );

  const snapshot = useSyncExternalStore(
    subscribeTheme,
    getClientSnapshot,
    () => SERVER_SNAPSHOT
  );

  const setTheme = useCallback((nextPref: ThemePref) => {
    setStoredThemePref(nextPref);
    applyTheme(nextPref);
    notifyListeners();
  }, []);

  return {
    theme: snapshot.theme,
    resolvedTheme: snapshot.resolvedTheme,
    setTheme,
    mounted,
  };
}
