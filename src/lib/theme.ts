import { useCallback, useSyncExternalStore } from "react";

/**
 * Theme infrastructure and resolution logic.
 *
 * NOTE on CSP:
 * `src/proxy.ts` currently configures Content-Security-Policy-Report-Only with
 * `script-src 'self' 'unsafe-inline'`, which permits the inline blocking theme script in layout.tsx.
 * If CSP is later switched to nonce-based enforcement, this inline script should be moved to a static
 * `<script src="/theme-init.js">` in `public/` or supplied with a per-request nonce.
 */

export type ThemePref = "light" | "dark" | "system";
export type ThemeResolved = "light" | "dark";

export const THEME_TOGGLE_ENABLED = false;
export const THEME_STORAGE_KEY = "theme";

/**
 * Pure function to resolve preferred theme against system preference.
 */
export function resolveTheme(pref: ThemePref, systemDark: boolean): ThemeResolved {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return systemDark ? "dark" : "light";
}

/**
 * Inline initialization script executed before first paint to prevent theme flash.
 * Default preference is 'light' when toggle is disabled to avoid accidental dark mode before P5.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}")||"light";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}else{document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light";}}catch(e){}})();`;

/**
 * Apply resolved theme to the document element (adds/removes .dark class and sets color-scheme).
 */
export function applyTheme(pref: ThemePref): ThemeResolved {
  if (typeof window === "undefined") {
    return "light";
  }

  const systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)").matches : false;
  const resolved = resolveTheme(pref, systemDark);

  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  root.style.colorScheme = resolved;

  return resolved;
}

/**
 * Reads stored theme preference from localStorage, safely falling back to 'light' (or 'system' if toggle enabled).
 */
export function getStoredThemePref(): ThemePref {
  if (typeof window === "undefined") return "light";
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") {
      return raw;
    }
  } catch {
    // localStorage may be disabled or throw security errors
  }
  return THEME_TOGGLE_ENABLED ? "system" : "light";
}

/**
 * Persists theme preference to localStorage.
 */
export function setStoredThemePref(pref: ThemePref): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // localStorage may be disabled
  }
}

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
