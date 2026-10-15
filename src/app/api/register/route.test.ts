import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      create: mocks.userCreate,
    },
  },
}));
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-pw"),
  },
}));
vi.mock("@/lib/env", () => ({
  hasJiraConfig: vi.fn().mockReturnValue(true),
}));

import { POST } from "./route";

describe("POST /api/register", () => {
  const origEnv = process.env.LEGACY_PASSWORD_LOGIN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LEGACY_PASSWORD_LOGIN = "1";
    mocks.session.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({
      id: "u-1",
      email: "test@example.com",
      displayName: "Test User",
      role: "member",
    });
  });

  afterEach(() => {
    process.env.LEGACY_PASSWORD_LOGIN = origEnv;
  });

  it("returns 410 when LEGACY_PASSWORD_LOGIN is not 1", async () => {
    process.env.LEGACY_PASSWORD_LOGIN = "0";
    const req = new Request("http://localhost/api/register", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.com" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(410);
  });

  it("returns 400 invalid_json on malformed body", async () => {
    const req = new Request("http://localhost/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_json" });
  });

  it("returns 400 when required fields are missing", async () => {
    const req = new Request("http://localhost/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "displayName, email and password are required",
    });
  });

  it("successfully registers user", async () => {
    const req = new Request("http://localhost/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Test User",
        email: "test@example.com",
        password: "password123",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: {
        id: "u-1",
        email: "test@example.com",
        displayName: "Test User",
        role: "member",
      },
      jiraConfigured: true,
    });
  });
});
