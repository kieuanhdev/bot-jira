import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  env: { jiraAutoDiscover: true },
  jiraProjectList: ["EPM", "ECM", "EIM"],
  catalog: [{ key: "EPM" }] as { key: string }[],
  users: [{ jiraUsername: "anhnk_mb", jiraUserEnc: null, jiraTokenEnc: "anh-token", jiraAuth: "Bearer" }],
  projectsByToken: {} as Record<string, { key: string; name: string; id: string }[] | "reject">,
  register: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: m.env, jiraProjectList: m.jiraProjectList }));
vi.mock("@/lib/crypto", () => ({ safeDecrypt: (v: string | null) => v }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn(async () => m.users) },
    jiraProject: { findMany: vi.fn(async () => m.catalog) },
  },
}));
vi.mock("./project-catalog", () => ({ registerVerifiedProject: m.register }));
vi.mock("./client", () => ({
  getSystemJiraAuth: vi.fn(async () => ({ user: "sys", token: "sys-token", authMode: "Bearer" })),
  jiraWith: (auth: { token: string }) => ({
    getProjects: async () => {
      const r = m.projectsByToken[auth.token];
      if (r === "reject" || !r) throw new Error("401");
      return r;
    },
  }),
}));

import {
  discoverJiraProjectAccess,
  registerAccessibleConfiguredProjects,
  resetJiraAccessCache,
  resolveJiraAuthForProject,
} from "./project-access";

const p = (key: string) => ({ key, name: `${key} name`, id: `id-${key}` });

describe("per-project Jira credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetJiraAccessCache();
    m.env.jiraAutoDiscover = true;
    m.catalog = [{ key: "EPM" }];
    m.projectsByToken = { "sys-token": [p("EPM")], "anh-token": [p("EPM"), p("ECM")] };
  });

  it("uses the first account that can read each project", async () => {
    expect((await resolveJiraAuthForProject("EPM"))?.token).toBe("sys-token");
    expect((await resolveJiraAuthForProject("ECM"))?.token).toBe("anh-token");
  });

  it("keeps working when one account is rejected", async () => {
    m.projectsByToken["sys-token"] = "reject";
    const access = await discoverJiraProjectAccess(true);
    expect([...access.keys()].sort()).toEqual(["ECM", "EPM"]);
    expect(access.get("EPM")?.auth.token).toBe("anh-token");
  });

  it("falls back to the system account for a project nobody can read", async () => {
    expect((await resolveJiraAuthForProject("ZZZ"))?.token).toBe("sys-token");
  });

  it("registers configured projects a stored account can read, and only those", async () => {
    const added = await registerAccessibleConfiguredProjects();
    expect(added).toEqual(["ECM"]); // EIM is configured but unreadable; EPM already in the catalog
    expect(m.register).toHaveBeenCalledWith(
      expect.objectContaining({ key: "ECM", name: "ECM name", source: "bootstrap" })
    );
  });

  it("never auto-registers projects that are visible but not configured", async () => {
    m.projectsByToken["anh-token"] = [p("EPM"), p("SECRET")];
    expect(await registerAccessibleConfiguredProjects()).toEqual([]);
  });

  it("is a no-op when auto discovery is disabled", async () => {
    m.env.jiraAutoDiscover = false;
    expect(await registerAccessibleConfiguredProjects()).toEqual([]);
    expect((await resolveJiraAuthForProject("ECM"))?.token).toBe("sys-token");
  });
});
