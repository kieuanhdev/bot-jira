import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOARD_STORAGE_KEYS,
  loadStoredColumnPreferences,
  loadStoredFilters,
  loadStoredProject,
  loadStoredSortMode,
  loadStoredViewMode,
  saveStoredColumnPreferences,
  saveStoredFilters,
  saveStoredProject,
  saveStoredSortMode,
  saveStoredViewMode,
} from "./board-storage";
import { DEFAULT_BOARD_FILTERS, type IssueFilters } from "@/lib/issues/issue-filters";

describe("board-storage unit tests", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key in store) delete store[key];
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((k: string) => store[k] ?? null),
      setItem: vi.fn((k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: vi.fn((k: string) => {
        delete store[k];
      }),
    });
  });

  describe("project persistence", () => {
    it("returns null when nothing is stored", () => {
      expect(loadStoredProject()).toBeNull();
    });

    it("saves and loads project key trimmed and uppercase", () => {
      saveStoredProject(" cicm ");
      expect(loadStoredProject()).toBe("CICM");
    });
  });

  describe("filter persistence", () => {
    it("returns null when project has no stored filters", () => {
      expect(loadStoredFilters("CICM")).toBeNull();
    });

    it("saves and loads filters accurately", () => {
      const filters: IssueFilters = {
        project: "CICM",
        query: "login bug",
        assigneeScope: {
          mode: "roster",
          roster: ["me", "bob"],
          view: "bob",
        },
        statuses: [],
        labels: ["backend"],
        priorities: ["High"],
        epics: [],
        includeDone: false,
      };

      saveStoredFilters("CICM", filters);
      const loaded = loadStoredFilters("CICM");
      expect(loaded).toEqual({
        project: "CICM",
        query: "login bug",
        assigneeScope: {
          mode: "roster",
          roster: ["me", "bob"],
          view: "bob",
        },
        statuses: [],
        labels: ["backend"],
        priorities: ["High"],
        epics: [],
        includeDone: false,
      });
    });

    it("gracefully normalizes corrupted/partial filters", () => {
      store[`${BOARD_STORAGE_KEYS.FILTERS_PREFIX}CICM`] = JSON.stringify({
        query: "partial",
        labels: ["test"],
      });
      const loaded = loadStoredFilters("CICM");
      expect(loaded).toEqual({
        project: "CICM",
        query: "partial",
        assigneeScope: DEFAULT_BOARD_FILTERS.assigneeScope,
        statuses: [],
        labels: ["test"],
        priorities: [],
        epics: [],
        includeDone: true,
      });
    });

    it("handles invalid JSON without throwing", () => {
      store[`${BOARD_STORAGE_KEYS.FILTERS_PREFIX}CICM`] = "invalid-json";
      expect(loadStoredFilters("CICM")).toBeNull();
    });
  });

  describe("column preference persistence", () => {
    it("stores preferences per project and removes duplicates", () => {
      saveStoredColumnPreferences(" cicm ", { hidden: ["review", "review"], collapsed: ["done"] });
      expect(loadStoredColumnPreferences("CICM")).toEqual({ hidden: ["review"], collapsed: ["done"] });
      expect(loadStoredColumnPreferences("OTHER")).toEqual({ hidden: [], collapsed: [] });
    });

    it("handles malformed preferences", () => {
      store[BOARD_STORAGE_KEYS.COLUMN_PREFS_PREFIX + "CICM"] = "invalid-json";
      expect(loadStoredColumnPreferences("CICM")).toEqual({ hidden: [], collapsed: [] });
    });
  });

  describe("sort and view mode persistence", () => {
    it("persists sort mode", () => {
      expect(loadStoredSortMode()).toBeNull();
      saveStoredSortMode("priority");
      expect(loadStoredSortMode()).toBe("priority");
      saveStoredSortMode("age");
      expect(loadStoredSortMode()).toBe("age");
    });

    it("persists view mode", () => {
      expect(loadStoredViewMode()).toBeNull();
      saveStoredViewMode("list");
      expect(loadStoredViewMode()).toBe("list");
      saveStoredViewMode("board");
      expect(loadStoredViewMode()).toBe("board");
    });
  });
});
