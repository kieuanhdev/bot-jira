import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    jiraBaseUrl: "https://jira.example.com/",
    jiraUser: "system",
    jiraToken: "system-token",
    jiraAuth: "Bearer",
    jiraPointsFieldId: "",
    jiraRequestTimeoutMs: 1000,
  },
}));

import { jiraWith, JiraRequestError, type JiraAuth } from "./client";

const bearerAuth: JiraAuth = {
  user: "alice",
  token: "bearer-token",
  authMode: "Bearer",
};

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function abortableFetch() {
  return vi.fn((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const rejectAborted = () =>
        reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));

      if (signal?.aborted) {
        rejectAborted();
        return;
      }
      signal?.addEventListener("abort", rejectAborted, { once: true });
    })
  );
}

describe("Jira HTTP transport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T00:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps the jiraWith public method surface stable", () => {
    expect(Object.keys(jiraWith(bearerAuth)).sort()).toEqual(
      [
        "addComment",
        "addWorklog",
        "createIssue",
        "createIssueLink",
        "createVersion",
        "deleteIssue",
        "findIssueByBulkMarker",
        "findTransition",
        "getBoard",
        "getBoardBacklog",
        "getBoardConfiguration",
        "getBoardIssues",
        "getBoardProjects",
        "getBoardsForProject",
        "getComments",
        "getCommentsPage",
        "getConfiguration",
        "getCreateMetaFields",
        "getCreateMetaIssueTypes",
        "getCreateMetadata",
        "getEditMeta",
        "getFields",
        "getIssue",
        "getIssueLinkTypes",
        "getMyPermissions",
        "getProject",
        "getProjectComponents",
        "getProjectStatuses",
        "getProjects",
        "getTransitions",
        "getVersion",
        "getVersions",
        "getWorklogs",
        "me",
        "releaseVersion",
        "removeIssueLabel",
        "resolvePointsField",
        "resolveVersionId",
        "search",
        "searchKeys",
        "searchAssignableUsers",
        "searchParentIssues",
        "searchTemplateIssues",
        "transition",
        "updateIssue",
        "updateVersion",
      ].sort()
    );
  });

  it("accepts an empty body on a successful write (Jira answers 201 for issueLink)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      jiraWith(bearerAuth).createIssueLink("Cloners", "MR-33", "MR-32")
    ).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://jira.example.com/rest/api/2/issueLink");
    expect(JSON.parse(String(init.body))).toEqual({
      type: { name: "Cloners" },
      inwardIssue: { key: "MR-33" },
      outwardIssue: { key: "MR-32" },
    });
  });

  it("sends the normalized URL and default JSON headers with Bearer auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ name: "alice" }));
    vi.stubGlobal("fetch", fetchMock);

    await jiraWith(bearerAuth).me();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://jira.example.com/rest/api/2/myself");
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Bearer bearer-token",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("encodes username and token for Basic auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ name: "alice" }));
    vi.stubGlobal("fetch", fetchMock);

    await jiraWith({ user: "alice", token: "secret", authMode: "basic" }).me();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("alice:secret").toString("base64")}`
    );
  });

  it("retries retryable failures with 2s then 4s backoff", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ errorMessages: ["Unavailable"] }, 503))
      .mockResolvedValueOnce(json({ errorMessages: ["Still unavailable"] }, 503))
      .mockResolvedValueOnce(json({ name: "alice" }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = jiraWith(bearerAuth).me();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(3999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ name: "alice" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("honors Retry-After delta-seconds before retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ errorMessages: ["Rate limited"] }, 429, { "Retry-After": "3" }))
      .mockResolvedValueOnce(json({ name: "alice" }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = jiraWith(bearerAuth).me();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ name: "alice" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors Retry-After HTTP-date before retrying", async () => {
    const retryAt = new Date("2026-10-08T00:00:05.000Z").toUTCString();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ errorMessages: ["Rate limited"] }, 429, { "Retry-After": retryAt }))
      .mockResolvedValueOnce(json({ name: "alice" }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = jiraWith(bearerAuth).me();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ name: "alice" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps transport timeouts to a retryable error after three attempts", async () => {
    const fetchMock = abortableFetch();
    vi.stubGlobal("fetch", fetchMock);

    const pending = jiraWith(bearerAuth).me();
    const rejection = expect(pending).rejects.toMatchObject({
      name: "JiraRequestError",
      status: null,
      retryable: true,
      message: "Jira GET /rest/api/2/myself -> timeout",
    });

    await vi.runAllTimersAsync();
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("propagates a caller abort without retrying", async () => {
    const fetchMock = abortableFetch();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const pending = jiraWith(bearerAuth).getCommentsPage("EPM-1", 0, 100, controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(new DOMException("Cancelled by caller", "AbortError"));

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-retryable HTTP errors and preserves parsed details", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json(
        {
          errorMessages: ["Invalid request"],
          errors: { jql: "Malformed query" },
        },
        400
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(jiraWith(bearerAuth).me()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(JiraRequestError);
      expect(error).toMatchObject({
        status: 400,
        retryable: false,
        errorDetails: "jql: Malformed query; Invalid request",
      });
      return true;
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("escapes a trailing backslash in the parent-search JQL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ issues: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await jiraWith(bearerAuth).searchParentIssues("CICM", "login\\", 10);

    const jql = new URL((fetchMock.mock.calls[0] as [string])[0]).searchParams.get("jql") as string;
    expect(jql).toBe(
      'project = "CICM" AND (key ~ "login\\\\" OR summary ~ "login\\\\") AND "issuetype" != "Sub-task"'
    );
  });

  it("escapes an embedded quote and backslash together in the parent-search JQL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ issues: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await jiraWith(bearerAuth).searchParentIssues("CICM", 'a"b\\', 10);

    const jql = new URL((fetchMock.mock.calls[0] as [string])[0]).searchParams.get("jql") as string;
    expect(jql).toContain('"a\\"b\\\\"');
  });

  it("leaves a plain parent-search query unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ issues: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await jiraWith(bearerAuth).searchParentIssues("CICM", "login", 10);

    const jql = new URL((fetchMock.mock.calls[0] as [string])[0]).searchParams.get("jql") as string;
    expect(jql).toContain('key ~ "login"');
    expect(jql).not.toContain("\\");
  });

  it("routes a KEY-pattern parent search without the free-text escape path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ issues: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await jiraWith(bearerAuth).searchParentIssues("CICM", "CICM-123", 10);

    const jql = new URL((fetchMock.mock.calls[0] as [string])[0]).searchParams.get("jql") as string;
    expect(jql).toContain('key = "CICM-123"');
    expect(jql).not.toContain("~");
  });

  it("returns undefined on status 204 No Content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(jiraWith(bearerAuth).transition("TEST-1", "31")).resolves.toBeUndefined();
  });
});

