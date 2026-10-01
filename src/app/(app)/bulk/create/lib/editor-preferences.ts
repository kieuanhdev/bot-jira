"use client";

export type EditorMode = "fullscreen" | "standard";
export type GridDensity = "comfortable" | "compact";

const EDITOR_MODE_KEY = "bulk-create:editor-mode";
const DENSITY_KEY = "bulk-create:density";
const COLUMNS_PREFIX = "bulk-create-columns:";

export function getStoredEditorMode(): EditorMode {
  if (typeof window === "undefined") return "standard";
  try {
    const val = localStorage.getItem(EDITOR_MODE_KEY);
    if (val === "fullscreen" || val === "standard") return val;
    // Default to fullscreen on desktop viewport
    if (window.innerWidth >= 1024) return "fullscreen";
    return "standard";
  } catch {
    return "standard";
  }
}

export function setStoredEditorMode(mode: EditorMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EDITOR_MODE_KEY, mode);
  } catch {
    // ignore
  }
}

export function getStoredDensity(): GridDensity {
  if (typeof window === "undefined") return "comfortable";
  try {
    const val = localStorage.getItem(DENSITY_KEY);
    if (val === "comfortable" || val === "compact") return val;
    return "comfortable";
  } catch {
    return "comfortable";
  }
}

export function setStoredDensity(density: GridDensity): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DENSITY_KEY, density);
  } catch {
    // ignore
  }
}

export function getStoredColumns(projectKey: string, defaultColumnIds: string[]): string[] {
  if (typeof window === "undefined" || !projectKey) return defaultColumnIds;
  try {
    const raw = localStorage.getItem(`${COLUMNS_PREFIX}${projectKey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((id): id is string => typeof id === "string");
      }
    }
  } catch {
    // fallback
  }
  return defaultColumnIds;
}

export function setStoredColumns(projectKey: string, columnIds: string[]): void {
  if (typeof window === "undefined" || !projectKey) return;
  try {
    localStorage.setItem(`${COLUMNS_PREFIX}${projectKey}`, JSON.stringify(columnIds));
  } catch {
    // ignore
  }
}

export function resetStoredColumns(projectKey: string): void {
  if (typeof window === "undefined" || !projectKey) return;
  try {
    localStorage.removeItem(`${COLUMNS_PREFIX}${projectKey}`);
  } catch {
    // ignore
  }
}
