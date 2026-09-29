import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  getProject: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
  },
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: () => ({ user: "testuser", token: "secret", authMode: "Bearer" }),
}));
vi.mock("@/lib/jira/client", () => ({
  getSystemJiraAuth: () => null,
  jiraWith: () => ({
    getProject: mocks.getProject,
  }),
}));

import { POST } from "./route";

describe("POST /api/projects/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
  });

  it("returns 400 when project key is missing", async () => {
    const res = await POST(new Request("http://localhost/api/projects/validate", {
      method: "POST",
      body: JSON.stringify({ key: "" }),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("returns 400 when project key format is invalid", async () => {
    const res = await POST(new Request("http://localhost/api/projects/validate", {
      method: "POST",
      body: JSON.stringify({ key: "123-invalid!" }),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("returns 404 when project does not exist on Jira", async () => {
    const err = new Error("Not Found") as Error & { status?: number };
    err.status = 404;
    mocks.getProject.mockRejectedValue(err);

    const res = await POST(new Request("http://localhost/api/projects/validate", {
      method: "POST",
      body: JSON.stringify({ key: "NOTEXIST" }),
    }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("không tồn tại");
  });

  it("returns 403 when user does not have permission", async () => {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    mocks.getProject.mockRejectedValue(err);

    const res = await POST(new Request("http://localhost/api/projects/validate", {
      method: "POST",
      body: JSON.stringify({ key: "SECRET" }),
    }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("không có quyền truy cập");
  });

  it("returns 200 with project info when valid", async () => {
    mocks.getProject.mockResolvedValue({
      key: "MYPROJ",
      name: "My Awesome Project",
      id: "10023",
    });

    const res = await POST(new Request("http://localhost/api/projects/validate", {
      method: "POST",
      body: JSON.stringify({ key: "myproj" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.project).toEqual({
      key: "MYPROJ",
      name: "My Awesome Project",
      id: "10023",
    });
  });
});
