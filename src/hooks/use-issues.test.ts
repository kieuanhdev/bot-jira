import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  api: mocks.api,
}));

import { fetchIssuesPage, isMembershipPending } from "./use-issues";

describe("fetchIssuesPage serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serializes array of assignees into comma-separated query param", async () => {
    mocks.api.mockResolvedValueOnce({ items: [], total: 0 });

    await fetchIssuesPage(
      {
        project: "MR",
        assignee: ["me", "alice", "bob"],
        includeDone: true,
      },
      0,
      100
    );

    expect(mocks.api).toHaveBeenCalledWith(
      expect.stringContaining("/api/issues?")
    );
    const calledUrl: string = mocks.api.mock.calls[0][0];
    const qs = new URL(calledUrl, "http://localhost").searchParams;

    expect(qs.get("project")).toBe("MR");
    expect(qs.get("assignee")).toBe("me,alice,bob");
    expect(qs.get("includeDone")).toBe("1");
    expect(qs.get("offset")).toBe("0");
    expect(qs.get("limit")).toBe("100");
  });

  it("serializes single string assignee as is", async () => {
    mocks.api.mockResolvedValueOnce({ items: [], total: 0 });

    await fetchIssuesPage(
      {
        project: "MR",
        assignee: "ALL",
      },
      10,
      50
    );
    const calledUrl: string = mocks.api.mock.calls[0][0];
    const qs = new URL(calledUrl, "http://localhost").searchParams;

    expect(qs.get("assignee")).toBe("ALL");
    expect(qs.get("offset")).toBe("10");
    expect(qs.get("limit")).toBe("50");
  });

  it("serializes arrays of status, label, and priority into comma-separated params", async () => {
    mocks.api.mockResolvedValueOnce({ items: [], total: 0 });

    await fetchIssuesPage(
      {
        project: "MR",
        status: ["In Progress", "Review"],
        label: ["frontend", "core"],
        priority: ["High", "Highest"],
      },
      0,
      100
    );

    const calledUrl: string = mocks.api.mock.calls[0][0];
    const qs = new URL(calledUrl, "http://localhost").searchParams;

    expect(qs.get("status")).toBe("In Progress,Review");
    expect(qs.get("label")).toBe("frontend,core");
    expect(qs.get("priority")).toBe("High,Highest");
  });
});

describe("isMembershipPending", () => {
  it("returns true for membership_pending and membership_preparing", () => {
    expect(isMembershipPending({ code: "membership_pending", projectKey: "EPM", boardId: 101 })).toBe(true);
    expect(isMembershipPending({ code: "membership_preparing", projectKey: "EPM", boardId: 101 })).toBe(true);
    expect(isMembershipPending({ items: [], total: 0 })).toBe(false);
    expect(isMembershipPending(null)).toBe(false);
    expect(isMembershipPending(undefined)).toBe(false);
  });
});

