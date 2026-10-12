import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  watchers: vi.fn(),
  author: vi.fn(),
  users: vi.fn(),
  issue: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  watch: { findMany: mocks.watchers },
  user: { findFirst: mocks.author, findMany: mocks.users },
  issueCache: { findUnique: mocks.issue },
} }));
vi.mock("@/lib/notify", () => ({ notifyUser: mocks.notify }));
import {
  watchedIssueChangedFields,
  notifyWatchersOfComment,
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

describe("Jira comment notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.author.mockResolvedValue({ id: "comment-author" });
    mocks.watchers.mockResolvedValue([{ userId: "watcher" }]);
    mocks.issue.mockResolvedValue({ assigneeJira: "alice_mb" });
    mocks.users.mockResolvedValue([{ id: "assignee" }]);
    mocks.notify.mockResolvedValue({ id: "notification" });
  });

  it("notifies the current assignee even when they do not watch the task", async () => {
    const count = await notifyWatchersOfComment("EPM-42", "bob", "Please check this", "1001");

    expect(count).toBe(2);
    expect(mocks.notify).toHaveBeenCalledWith("watcher", expect.objectContaining({ type: "comment" }));
    expect(mocks.notify).toHaveBeenCalledWith("assignee", expect.objectContaining({
      type: "comment",
      link: "/issue/EPM-42",
    }));
  });

  it("does not send twice when the assignee also watches the task", async () => {
    mocks.watchers.mockResolvedValue([{ userId: "assignee" }]);

    expect(await notifyWatchersOfComment("EPM-42", "bob", "Please check this", "1002")).toBe(1);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("does not notify the assignee when they wrote the comment", async () => {
    mocks.author.mockResolvedValue({ id: "assignee" });

    expect(await notifyWatchersOfComment("EPM-42", "alice_mb", "My own update", "1003")).toBe(1);
    expect(mocks.notify).not.toHaveBeenCalledWith("assignee", expect.anything());
    expect(mocks.notify).toHaveBeenCalledWith("watcher", expect.anything());
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

describe("task assignment notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.watchers.mockResolvedValue([{ userId: "watcher" }]);
    mocks.author.mockResolvedValue({ id: "actor" });
    mocks.users.mockResolvedValue([{ id: "new-assignee" }]);
    mocks.notify.mockResolvedValue({ id: "notification" });
  });

  it("notifies the new assignee when a task is assigned to them", async () => {
    const prev = issue({ assigneeJira: "alice" });
    const curr = issue({ assigneeJira: "bob" });

    const count = await notifyWatchersOfIssueChange(prev, curr, { authorName: "alice" });

    expect(count).toBe(2);
    expect(mocks.notify).toHaveBeenCalledWith("new-assignee", expect.objectContaining({
      type: "issue",
      title: "Bạn được gán task EPM-42",
      body: expect.stringContaining('alice đã gán task "A task" cho bạn.'),
      link: "/issue/EPM-42",
    }));
    expect(mocks.notify).toHaveBeenCalledWith("watcher", expect.objectContaining({
      type: "issue",
      title: "Task EPM-42 vừa được cập nhật",
    }));
  });

  it("does not send duplicate notification if new assignee is also a watcher", async () => {
    mocks.watchers.mockResolvedValue([{ userId: "new-assignee" }, { userId: "watcher" }]);
    const prev = issue({ assigneeJira: "alice" });
    const curr = issue({ assigneeJira: "bob" });

    const count = await notifyWatchersOfIssueChange(prev, curr, { authorName: "alice" });

    expect(count).toBe(2);
    expect(mocks.notify).toHaveBeenCalledWith("new-assignee", expect.objectContaining({
      title: "Bạn được gán task EPM-42",
    }));
    expect(mocks.notify).not.toHaveBeenCalledWith("new-assignee", expect.objectContaining({
      title: "Task EPM-42 vừa được cập nhật",
    }));
  });

  it("does not notify assignee when they assigned the task to themselves", async () => {
    mocks.author.mockResolvedValue({ id: "new-assignee" });
    const prev = issue({ assigneeJira: "alice" });
    const curr = issue({ assigneeJira: "bob" });

    const count = await notifyWatchersOfIssueChange(prev, curr, { excludeUserId: "new-assignee" });

    expect(count).toBe(1);
    expect(mocks.notify).not.toHaveBeenCalledWith("new-assignee", expect.anything());
    expect(mocks.notify).toHaveBeenCalledWith("watcher", expect.anything());
  });
});

