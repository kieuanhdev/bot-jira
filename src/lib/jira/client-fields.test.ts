import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    jiraBaseUrl: "https://jira.example.com",
    jiraUser: "",
    jiraToken: "",
    jiraAuth: "Bearer",
    jiraPointsFieldId: "",
    jiraRequestTimeoutMs: 5000,
  },
}));

import { jiraWith } from "./client";
import type { JiraAuth } from "./client";

const auth: JiraAuth = { user: "alice", token: "token", authMode: "Bearer" };

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Jira dynamic issue fields", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("writes points to the editable Task Points field returned by editmeta", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({
        fields: {
          customfield_10502: {
            name: "Task Points",
            schema: { type: "number", customId: 10502 },
            operations: ["set"],
          },
          customfield_10006: {
            name: "Original story points",
            schema: { type: "number", customId: 10006 },
            operations: ["set"],
          },
        },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await jiraWith(auth).updateIssue("EPM-4303", { points: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/issue/EPM-4303/editmeta");
    const [, update] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(update.body))).toEqual({ fields: { customfield_10502: 5 } });
  });

  it("writes to Story Points when that is the editable field for another project", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({
        fields: {
          customfield_10006: {
            name: "Story Points",
            schema: { type: "number", customId: 10006 },
            operations: ["set"],
          },
        },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await jiraWith(auth).updateIssue("OTHER-10", { points: 8 });

    const [, update] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(update.body))).toEqual({ fields: { customfield_10006: 8 } });
  });

  it("uses Jira system fields for due date, estimate and the worklog endpoint", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ id: "10" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = jiraWith(auth);

    await client.updateIssue("EPM-4303", { dueDate: "2026-10-15" });
    await client.updateIssue("EPM-4303", { originalEstimate: "1d 4h" });
    await client.addWorklog("EPM-4303", {
      timeSpent: "2h",
      started: "2026-09-29T09:00:00.000+0000",
      comment: "Review",
    }, "leave");

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      fields: { duedate: "2026-10-15" },
    });
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      fields: { timetracking: { originalEstimate: "1d 4h" } },
    });
    expect(String(fetchMock.mock.calls[2][0])).toContain("/worklog?adjustEstimate=leave");
  });

  it("removes a label using Jira update operation with remove verb", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = jiraWith(auth);

    await client.removeIssueLabel("EPM-4303", "ttw-bulk-dcw6g2h6-52");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/rest/api/2/issue/EPM-4303");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({
      update: {
        labels: [{ remove: "ttw-bulk-dcw6g2h6-52" }],
      },
    });
  });

  it("falls back to GET labels and PUT fields if update operation fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errorMessages: ["Field labels cannot be updated using update operation"] }), { status: 400 }))
      .mockResolvedValueOnce(json({ fields: { labels: ["flow-support", "ttw-bulk-dcw6g2h6-52"] } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = jiraWith(auth);

    await client.removeIssueLabel("EPM-4303", "ttw-bulk-dcw6g2h6-52");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [putUrl, putInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(putUrl).toContain("/rest/api/2/issue/EPM-4303");
    expect(putInit.method).toBe("PUT");
    expect(JSON.parse(String(putInit.body))).toEqual({
      fields: {
        labels: ["flow-support"],
      },
    });
  });
});
