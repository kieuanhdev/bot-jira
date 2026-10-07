import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findMany: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { projectPeopleField: db } }));
vi.mock("./client", async (load) => {
  const actual = await load<typeof import("./client")>();
  return { ...actual, getSystemJiraAuth: vi.fn().mockResolvedValue(null) };
});

import { detectPeopleFields } from "./people-fields";

describe("detectPeopleFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.findMany.mockResolvedValue([]);
    db.upsert.mockResolvedValue({});
    db.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("samples every issue type and matches people fields by name", async () => {
    const client = {
      getProjectStatuses: vi.fn().mockResolvedValue([{ name: "Bug" }, { name: "Task" }]),
      search: vi.fn()
        .mockResolvedValueOnce({ issues: [{ key: "EPM-1" }] })
        .mockResolvedValueOnce({ issues: [{ key: "EPM-2" }] }),
      getEditMeta: vi.fn()
        .mockResolvedValueOnce({ fields: { customfield_20001: { name: "Approver" } } })
        .mockResolvedValueOnce({ fields: { customfield_20002: { name: "Assignee Tester" } } }),
    };
    await detectPeopleFields("epm", client as never);
    expect(client.search).toHaveBeenCalledTimes(2);
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ role: "approver", jiraFieldId: "customfield_20001" }) }));
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ role: "tester", jiraFieldId: "customfield_20002" }) }));
  });

  it("does not overwrite manual rows", async () => {
    db.findMany.mockResolvedValue([{ projectKey: "EPM", role: "approver", jiraFieldId: "customfield_9", source: "manual", detectedAt: new Date() }]);
    const client = {
      getProjectStatuses: vi.fn().mockResolvedValue([{ name: "Bug" }]),
      search: vi.fn().mockResolvedValue({ issues: [{ key: "EPM-1" }] }),
      getEditMeta: vi.fn().mockResolvedValue({ fields: { customfield_20001: { name: "Approver" } } }),
    };
    await detectPeopleFields("EPM", client as never);
    expect(db.upsert).not.toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ jiraFieldId: "customfield_20001" }) }));
  });

  it("keeps detected rows when no editmeta could be read", async () => {
    const client = {
      getProjectStatuses: vi.fn().mockResolvedValue([{ name: "Bug" }]),
      search: vi.fn().mockResolvedValue({ issues: [{ key: "EPM-1" }] }),
      getEditMeta: vi.fn().mockRejectedValue(new Error("403")),
    };
    await detectPeopleFields("EPM", client as never);
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it("removes detected rows when Jira answered but the field is gone", async () => {
    const client = {
      getProjectStatuses: vi.fn().mockResolvedValue([{ name: "Bug" }]),
      search: vi.fn().mockResolvedValue({ issues: [{ key: "EPM-1" }] }),
      getEditMeta: vi.fn().mockResolvedValue({ fields: {} }),
    };
    await detectPeopleFields("EPM", client as never);
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { projectKey: "EPM", role: "approver", source: "detected" } });
  });
});
