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

export const THEME_TOGGLE_ENABLED = true;
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
 * Default preference is 'system' now that theme toggle is enabled.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}else{document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light";}}catch(e){}})();`;

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
  if (typeof window === "undefined") return "system";
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") {
      return raw;
    }
  } catch {
    // localStorage may be disabled or throw security errors
  }
  return "system";
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
