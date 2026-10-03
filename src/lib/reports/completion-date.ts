import { isDoneGroup, normalizeStatusToGroup } from "./status";

export interface ResolvedCompletionDate {
  date: Date | null;
  source: "done_at_field" | "resolution_date" | "transition_event" | "status_changed_at" | "none";
  confidence: "high" | "medium" | "low" | "none";
}

/**
 * Resolves the completion date of an issue according to Section 5.4 priority:
 * 1. Jira Done At / custom resolution date
 * 2. Jira raw fields resolutiondate
 * 3. Transition event first entry into Done statusGroup (passed optionally)
 * 4. statusChangedAt if current status is in Done group (confidence low)
 * Never uses updatedAt or createdAt.
 */
export function resolveCompletionDate(issue: {
  status: string;
  statusCategory?: string | null;
  statusChangedAt?: Date | null;
  raw?: unknown;
  transitionDoneDate?: Date | null;
}): ResolvedCompletionDate {
  const group = normalizeStatusToGroup(issue.status, issue.statusCategory || undefined);
  const isDone = isDoneGroup(group);

  // 1 & 2. Check Done At custom field or resolutiondate in raw
  const rawObj =
    issue.raw && typeof issue.raw === "object" ? (issue.raw as Record<string, unknown>) : undefined;
  const rawFields =
    rawObj?.fields && typeof rawObj.fields === "object"
      ? (rawObj.fields as Record<string, unknown>)
      : rawObj;

  if (rawFields) {
    // 1. Jira Done At (customfield_10706) or custom completion date
    const doneAtVal =
      rawFields.customfield_10706 ?? rawFields.doneAt ?? rawFields.done_at;
    if (typeof doneAtVal === "string" || typeof doneAtVal === "number") {
      const parsed = new Date(doneAtVal);
      if (!isNaN(parsed.getTime())) {
        return { date: parsed, source: "done_at_field", confidence: "high" };
      }
    }

    // 2. Jira resolutiondate
    const resDateVal = rawFields.resolutiondate ?? rawFields.resolutionDate;
    if (typeof resDateVal === "string" || typeof resDateVal === "number") {
      const parsed = new Date(resDateVal);
      if (!isNaN(parsed.getTime())) {
        return { date: parsed, source: "resolution_date", confidence: "high" };
      }
    }
  }

  // 3. Transition event if available
  if (issue.transitionDoneDate) {
    return { date: issue.transitionDoneDate, source: "transition_event", confidence: "high" };
  }

  // 4. statusChangedAt fallback if current status is Done
  if (isDone && issue.statusChangedAt) {
    return { date: issue.statusChangedAt, source: "status_changed_at", confidence: "low" };
  }

  return { date: null, source: "none", confidence: "none" };
}

/**
 * Check if a date falls within inclusive YYYY-MM-DD boundary in a timezone
 */
export function isDateInPeriod(
  date: Date | null | undefined,
  fromStr: string,
  toStr: string,
  timezone: string
): boolean {
  if (!date) return false;
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dateStr = formatter.format(date);
    return dateStr >= fromStr && dateStr <= toStr;
  } catch {
    const dateStr = date.toISOString().split("T")[0];
    return dateStr >= fromStr && dateStr <= toStr;
  }
}
