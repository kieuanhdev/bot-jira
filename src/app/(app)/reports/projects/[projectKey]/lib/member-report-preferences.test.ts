import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberReportItem } from "@/lib/reports/types";
import {
  clearMemberVisibility,
  filterMembersByVisibility,
  loadMemberVisibility,
  saveMemberVisibility,
} from "./member-report-preferences";

const members = [
  { assignee: "alice", displayName: "Alice" },
  { assignee: "bob", displayName: "Bob" },
] as MemberReportItem[];

describe("member report preferences", () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal("window", { localStorage });
  });

  it("shows everyone until a selection is saved", () => {
    const preference = loadMemberVisibility("epm");
    expect(preference.hasSavedSelection).toBe(false);
    expect(filterMembersByVisibility(members, preference)).toEqual(members);
  });

  it("stores a unique per-project allowlist and filters the report", () => {
    const preference = saveMemberVisibility("epm", ["bob", "bob"]);
    expect(loadMemberVisibility("EPM")).toEqual({ hasSavedSelection: true, assignees: ["bob"] });
    expect(filterMembersByVisibility(members, preference)).toEqual([members[1]]);
    expect(loadMemberVisibility("OTHER").hasSavedSelection).toBe(false);
  });

  it("returns to the dynamic all-members view when cleared", () => {
    saveMemberVisibility("EPM", ["alice"]);
    const preference = clearMemberVisibility("EPM");
    expect(filterMembersByVisibility(members, preference)).toEqual(members);
    expect(loadMemberVisibility("EPM").hasSavedSelection).toBe(false);
  });

  it("ignores malformed stored data", () => {
    values.set("reports:members:visible:v1:EPM", "not-json");
    expect(loadMemberVisibility("EPM").hasSavedSelection).toBe(false);
  });
});
