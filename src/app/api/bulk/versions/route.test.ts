import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  getVersions: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.user } } }));
vi.mock("@/lib/env", () => ({
  isKnownProject: (key: string) => ["EPM", "MHRM"].includes(key.toUpperCase()),
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: () => ({ user: "alice", token: "token", authMode: "Bearer" }),
}));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({ getVersions: mocks.getVersions }),
}));

import { GET } from "./route";

describe("GET /api/bulk/versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "encrypted" });
    mocks.getVersions.mockImplementation(async (project: string) => project === "EPM"
      ? [
          { id: "epm-1", name: "1.4.2", released: false, archived: false },
          { id: "epm-2", name: "shared", released: true, archived: false },
        ]
      : [
          { id: "mhrm-1", name: "shared", released: false, archived: false },
          { id: "mhrm-2", name: "legacy", released: true, archived: true },
        ]);
  });

  it("groups existing versions by name while retaining their project scope", async () => {
    const response = await GET(new Request("http://localhost/api/bulk/versions?projects=EPM,MHRM,UNKNOWN"));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(mocks.getVersions).toHaveBeenCalledTimes(2);
    expect(body.projects).toEqual(["EPM", "MHRM"]);
    expect(body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "1.4.2", projects: ["EPM"] }),
      expect.objectContaining({ name: "shared", projects: ["EPM", "MHRM"], releasedProjects: ["EPM"] }),
      expect.objectContaining({ name: "legacy", projects: ["MHRM"], archivedProjects: ["MHRM"] }),
    ]));
  });

  it("returns 401 without a session", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/bulk/versions?projects=EPM"));
    expect(response.status).toBe(401);
    expect(mocks.getVersions).not.toHaveBeenCalled();
  });
});
