import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  prismaUserFindUnique: vi.fn(),
  userJiraAuth: vi.fn(),
  userBitbucketCreds: vi.fn(),
  jiraMe: vi.fn(),
  jiraWith: vi.fn(),
  hasJiraCredentials: vi.fn(),
  hasBitbucketConfig: vi.fn(),
  bitbucketListBranches: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.prismaUserFindUnique,
    },
  },
}));

vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: mocks.userJiraAuth,
  userBitbucketCreds: mocks.userBitbucketCreds,
}));

vi.mock("@/lib/jira/client", () => ({
  jiraWith: mocks.jiraWith,
  hasJiraCredentials: mocks.hasJiraCredentials,
}));

vi.mock("@/lib/bitbucket/client", () => ({
  bitbucket: {
    listBranches: mocks.bitbucketListBranches,
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    jiraBaseUrl: "https://jira.example.com",
    bitbucketBaseUrl: "https://bb.example.com",
  },
  hasBitbucketConfig: mocks.hasBitbucketConfig,
  bitbucketRepoList: ["repo-1"],
}));

import { GET } from "./route";

describe("GET /api/me/integrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.hasBitbucketConfig.mockReturnValue(true);
    mocks.hasJiraCredentials.mockResolvedValue(true);
    mocks.jiraWith.mockReturnValue({ me: mocks.jiraMe });
  });

  it("returns 401 when not authenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 404 when user is not found in DB", async () => {
    mocks.prismaUserFindUnique.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("executes Jira and Bitbucket checks in parallel (time ≈ max, not sum)", async () => {
    mocks.prismaUserFindUnique.mockResolvedValue({
      jiraUsername: "alice",
      jiraTokenEnc: "enc-jira",
      bitbucketTokenEnc: "enc-bb",
      jiraVerifiedAt: new Date("2026-01-01T00:00:00Z"),
      bitbucketVerifiedAt: new Date("2026-01-01T00:00:00Z"),
    });
    mocks.userJiraAuth.mockReturnValue({ authMode: "Bearer", token: "tok" });
    mocks.userBitbucketCreds.mockReturnValue({ user: "alice-bb", token: "bb-tok" });

    // Both take 40ms
    mocks.jiraMe.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ name: "Alice J", displayName: "Alice Jira" }), 40))
    );
    mocks.bitbucketListBranches.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([{ name: "main" }]), 40))
    );

    const start = Date.now();
    const res = await GET();
    const duration = Date.now() - start;

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.jira.linked).toBe(true);
    expect(data.jira.status.ok).toBe(true);
    expect(data.jira.status.detail).toBe("Alice Jira");

    expect(data.bitbucket.linked).toBe(true);
    expect(data.bitbucket.status.ok).toBe(true);
    expect(data.bitbucket.status.detail).toBe("alice-bb");

    expect(data.syncAvailable).toEqual({ jira: true, bitbucket: true });
    expect(data.bitbucketRepo).toBe("repo-1");

    // If sequential, duration >= 80ms. If parallel, duration < 75ms.
    expect(duration).toBeLessThan(75);
  });
});
