import { describe, expect, it } from "vitest";
import {
  watchedIssueChangedFields,
  type WatchedIssueSnapshot,
} from "./notify-watchers";

function issue(overrides: Partial<WatchedIssueSnapshot> = {}): WatchedIssueSnapshot {
  return {
    jiraKey: "EPM-42",
    summary: "A task",
    description: "Description",
    status: "To Do",
    assigneeJira: "alice",
    labels: ["mobile", "urgent"],
    fixVersionNames: ["1.0"],
    priority: "High",
    points: 3,
    type: "Story",
    dueDate: new Date("2026-09-30T00:00:00.000Z"),
    timeSpent: 60,
    updatedAt: new Date("2026-09-27T01:00:00.000Z"),
    ...overrides,
  };
}

describe("watchedIssueChangedFields", () => {
  it("detects important issue metadata changes", () => {
    expect(watchedIssueChangedFields(issue(), issue({ status: "In Progress", points: 5 })))
      .toEqual(["trạng thái", "story point"]);
  });

  it("does not treat Jira array ordering or updated timestamp as a field change", () => {
    expect(watchedIssueChangedFields(
      issue(),
      issue({ labels: ["urgent", "mobile"], updatedAt: new Date("2026-09-27T02:00:00.000Z") })
    )).toEqual([]);
  });
});
