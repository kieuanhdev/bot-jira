import type { MemberReportItem } from "@/lib/reports/types";

const STORAGE_KEY_PREFIX = "reports:members:visible:v1:";

export type MemberVisibilityPreference = {
  hasSavedSelection: boolean;
  assignees: string[];
};

export const DEFAULT_MEMBER_VISIBILITY: MemberVisibilityPreference = {
  hasSavedSelection: false,
  assignees: [],
};

function storageKey(projectKey: string): string {
  return `${STORAGE_KEY_PREFIX}${projectKey.trim().toUpperCase()}`;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

export function loadMemberVisibility(projectKey: string): MemberVisibilityPreference {
  if (typeof window === "undefined") return DEFAULT_MEMBER_VISIBILITY;

  try {
    const raw = window.localStorage.getItem(storageKey(projectKey));
    if (!raw) return DEFAULT_MEMBER_VISIBILITY;

    const assignees = uniqueStrings(JSON.parse(raw));
    if (assignees.length === 0) return DEFAULT_MEMBER_VISIBILITY;
    return { hasSavedSelection: true, assignees };
  } catch {
    return DEFAULT_MEMBER_VISIBILITY;
  }
}

export function saveMemberVisibility(projectKey: string, assignees: string[]): MemberVisibilityPreference {
  const normalized = uniqueStrings(assignees);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(storageKey(projectKey), JSON.stringify(normalized));
    } catch {
      // Keep the in-memory selection when browser storage is unavailable.
    }
  }
  return { hasSavedSelection: true, assignees: normalized };
}

export function clearMemberVisibility(projectKey: string): MemberVisibilityPreference {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(storageKey(projectKey));
    } catch {
      // Keep the default in-memory behavior when browser storage is unavailable.
    }
  }
  return DEFAULT_MEMBER_VISIBILITY;
}

export function filterMembersByVisibility(
  members: MemberReportItem[],
  preference: MemberVisibilityPreference
): MemberReportItem[] {
  if (!preference.hasSavedSelection) return members;
  const visible = new Set(preference.assignees);
  return members.filter((member) => visible.has(member.assignee));
}
