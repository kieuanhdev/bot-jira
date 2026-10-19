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
} from "./theme";

export type { ThemePref, ThemeResolved };

type ThemeSnapshot = {
  theme: ThemePref;
  resolvedTheme: ThemeResolved;
};

const SERVER_SNAPSHOT: ThemeSnapshot = {
  theme: "system",
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
 * Client hook for managing and synchronizing theme preference across tabs and system changes.
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
