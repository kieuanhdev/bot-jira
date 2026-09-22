import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    jiraBaseUrl: "https://jira.example.com",
    jiraUser: "team",
    jiraToken: "team-token",
    jiraAuth: "Bearer",
    jiraRequestTimeoutMs: 5000,
  },
}));

import { probeJiraAuth } from "./client";
import type { JiraAuth } from "./client";

const okRes = { ok: true } as Response;
const badRes = { ok: false, status: 401 } as Response;

describe("probeJiraAuth", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns true when /myself accepts the credential", async () => {
    const fetchMock = vi.fn(async () => okRes);
    vi.stubGlobal("fetch", fetchMock);
    const auth: JiraAuth = { user: "team", token: "team-token", authMode: "Bearer" };
    await expect(probeJiraAuth(auth)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://jira.example.com/rest/api/2/myself");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer team-token");
  });

  it("returns false when /myself rejects the credential", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => badRes));
    const auth: JiraAuth = { user: "team", token: "team-token", authMode: "Bearer" };
    await expect(probeJiraAuth(auth)).resolves.toBe(false);
  });

  it("returns false on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNRESET");
    }));
    const auth: JiraAuth = { user: "team", token: "team-token", authMode: "Bearer" };
    await expect(probeJiraAuth(auth)).resolves.toBe(false);
  });

  it("falls back to the shared team token when the user has none", async () => {
    const fetchMock = vi.fn(async () => okRes);
    vi.stubGlobal("fetch", fetchMock);
    await expect(probeJiraAuth(null)).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://jira.example.com/rest/api/2/myself");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer team-token");
  });
});
