import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ watchers: vi.fn(), author: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  watch: { findMany: mocks.watchers }, user: { findFirst: mocks.author },
} }));
vi.mock("@/lib/notify", () => ({ notifyUser: mocks.notify }));
import {
  watchedIssueChangedFields,
  notifyWatchersOfIssueChange,
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

describe("watched status notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.watchers.mockResolvedValue([{ userId: "actor" }, { userId: "other" }]);
    mocks.author.mockResolvedValue({ id: "actor" });
    mocks.notify.mockResolvedValue({ id: "notification" });
  });

  it("notifies other watchers but excludes the user who transitioned the task on the web", async () => {
    expect(await notifyWatchersOfIssueChange(issue(), issue({ status: "Done" }), { excludeUserId: "actor" })).toBe(1);
    expect(mocks.notify).not.toHaveBeenCalledWith("actor", expect.anything());
    expect(mocks.notify).toHaveBeenCalledWith("other", expect.objectContaining({
      type: "transition", link: "/issue/EPM-42", body: expect.stringContaining("To Do → Done"),
    }));
    expect(mocks.notify).toHaveBeenCalledWith("other", expect.objectContaining({ type: "transition" }));
  });

  it("excludes the Jira webhook author for status changes", async () => {
    await notifyWatchersOfIssueChange(issue(), issue({ status: "Done" }), { authorName: "alice" });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).not.toHaveBeenCalledWith("actor", expect.anything());
  });

  it("does not notify for unchanged status or initial cache population", async () => {
    await notifyWatchersOfIssueChange(issue(), issue());
    await notifyWatchersOfIssueChange(null, issue());
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
