import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

const { prismaMock, sessionMock, userJiraAuthMock, getVersionsMock } = vi.hoisted(() => {
  const sessionMock = vi.fn();
  const userJiraAuthMock = vi.fn();
  const getVersionsMock = vi.fn();
  const prismaMock = {
    release: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };
  return { prismaMock, sessionMock, userJiraAuthMock, getVersionsMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({ getSession: sessionMock }));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: userJiraAuthMock }));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({
    getVersions: getVersionsMock,
  }),
  getSystemJiraAuth: vi.fn().mockResolvedValue(null),
}));

const ctx = (id = "r1") => ({
  params: Promise.resolve({ id }),
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockResolvedValue({ user: { id: "u1" } });
  userJiraAuthMock.mockReturnValue({ user: "u", token: "t", authMode: "Bearer" });
  prismaMock.release.findUnique.mockResolvedValue({ id: "r1", projectKey: "EPM" });
  getVersionsMock.mockResolvedValue([{ id: "v1", name: "1.0" }]);
});

describe("GET /api/releases/:id/versions", () => {
  it("returns 401 when unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/releases/r1/versions"), ctx());
    expect(res.status).toBe(401);
  });

  it("returns empty array when id is tmp and no projectKey param is provided", async () => {
    const res = await GET(new Request("http://x/api/releases/tmp/versions"), ctx("tmp"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
  });

  it("returns 404 when release not found and no projectKey param", async () => {
    prismaMock.release.findUnique.mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/releases/r1/versions"), ctx("r1"));
    expect(res.status).toBe(404);
  });

  it("returns 428 when user has no Jira auth", async () => {
    userJiraAuthMock.mockReturnValue(null);
    const res = await GET(new Request("http://x/api/releases/r1/versions"), ctx("r1"));
    expect(res.status).toBe(428);
  });

  it("returns Jira versions when credentials and projectKey are valid", async () => {
    const res = await GET(new Request("http://x/api/releases/r1/versions"), ctx("r1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([{ id: "v1", name: "1.0" }]);
    expect(getVersionsMock).toHaveBeenCalledWith("EPM");
  });

  it("returns 502 when Jira getVersions fails", async () => {
    getVersionsMock.mockRejectedValue(new Error("Jira API error"));
    const res = await GET(new Request("http://x/api/releases/r1/versions"), ctx("r1"));
    expect(res.status).toBe(502);
  });
});
