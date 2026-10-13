import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifyUnauthorizedMerge } from "./notify-pr-merged";

const { mocks } = vi.hoisted(() => {
  return {
    mocks: {
      discoverPrJiraKeys: vi.fn(),
      getProjectLeaders: vi.fn(),
      deliverBranchNotifications: vi.fn(),
    },
  };
});

vi.mock("./branch-recipient-resolver", () => ({
  discoverPrJiraKeys: (...args: unknown[]) => mocks.discoverPrJiraKeys(...args),
}));

vi.mock("@/lib/projects/roles", () => ({
  getProjectLeaders: (...args: unknown[]) => mocks.getProjectLeaders(...args),
}));

vi.mock("./branch-notification-delivery", () => ({
  deliverBranchNotifications: (...args: unknown[]) =>
    mocks.deliverBranchNotifications(...args),
}));

describe("notifyUnauthorizedMerge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseArgs = {
    repo: "PRJ/backend",
    pr: {
      id: 10,
      title: "Hotfix payment",
      fromBranch: "hotfix/EPM-50",
      toBranch: "master",
      url: "https://git.example.com/pr/10",
    },
    actor: {
      name: "john_doe",
      displayName: "John Doe",
      emailAddress: "john@example.com",
    },
  };

  it("skips and returns no_jira_project when no jira keys are discovered", async () => {
    mocks.discoverPrJiraKeys.mockResolvedValueOnce([]);

    const result = await notifyUnauthorizedMerge(baseArgs);

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no_jira_project");
    expect(result.notifiedCount).toBe(0);
    expect(mocks.getProjectLeaders).not.toHaveBeenCalled();
    expect(mocks.deliverBranchNotifications).not.toHaveBeenCalled();
  });

  it("skips when no leaders are configured for the project", async () => {
    mocks.discoverPrJiraKeys.mockResolvedValueOnce(["EPM-50"]);
    mocks.getProjectLeaders.mockResolvedValueOnce([]);

    const result = await notifyUnauthorizedMerge(baseArgs);

    expect(result.skipped).toBe(true);
    expect(result.notifiedCount).toBe(0);
    expect(mocks.deliverBranchNotifications).not.toHaveBeenCalled();
  });

  it("does not notify when the actor is one of the project leaders", async () => {
    mocks.discoverPrJiraKeys.mockResolvedValueOnce(["EPM-50"]);
    mocks.getProjectLeaders.mockResolvedValueOnce([
      {
        id: "lead-1",
        displayName: "John Doe",
        jiraUsername: "john_doe",
        email: "john@example.com",
      },
    ]);

    const result = await notifyUnauthorizedMerge(baseArgs);

    expect(result.skipped).toBe(true);
    expect(result.notifiedCount).toBe(0);
    expect(mocks.deliverBranchNotifications).not.toHaveBeenCalled();
  });

  it("notifies all project leaders when actor is not a leader", async () => {
    mocks.discoverPrJiraKeys.mockResolvedValueOnce(["EPM-50"]);
    mocks.getProjectLeaders.mockResolvedValueOnce([
      {
        id: "lead-1",
        displayName: "Leader Alpha",
        jiraUsername: "leader_a",
        email: "a@example.com",
      },
      {
        id: "lead-2",
        displayName: "Leader Beta",
        jiraUsername: "leader_b",
        email: "b@example.com",
      },
    ]);
    mocks.deliverBranchNotifications.mockResolvedValueOnce(2);

    const result = await notifyUnauthorizedMerge(baseArgs);

    expect(result.skipped).toBe(false);
    expect(result.notifiedCount).toBe(2);
    expect(result.targetUserIds).toEqual(["lead-1", "lead-2"]);
    expect(mocks.deliverBranchNotifications).toHaveBeenCalledWith(
      ["lead-1", "lead-2"],
      expect.objectContaining({
        type: "pr",
        severity: "warning",
        title: expect.stringContaining("John Doe (không phải leader)"),
        eventKey: "bb-pr-merged-nonleader:PRJ/backend:10",
      })
    );
  });

  it("handles multi-project PRs correctly: alerts only leaders of projects where actor is not leader", async () => {
    mocks.discoverPrJiraKeys.mockResolvedValueOnce(["EPM-50", "CICM-12"]);
    // For EPM: actor is leader
    mocks.getProjectLeaders.mockImplementation(async (projectKey: string) => {
      if (projectKey === "EPM") {
        return [
          {
            id: "lead-epm",
            jiraUsername: "john_doe",
            email: "john@example.com",
          },
        ];
      }
      if (projectKey === "CICM") {
        return [
          {
            id: "lead-cicm",
            jiraUsername: "other_lead",
            email: "other@example.com",
          },
        ];
      }
      return [];
    });
    mocks.deliverBranchNotifications.mockResolvedValueOnce(1);

    const result = await notifyUnauthorizedMerge(baseArgs);

    expect(result.skipped).toBe(false);
    expect(result.targetUserIds).toEqual(["lead-cicm"]);
    expect(mocks.deliverBranchNotifications).toHaveBeenCalledWith(
      ["lead-cicm"],
      expect.any(Object)
    );
  });
});
