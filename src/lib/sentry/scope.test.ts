import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  resolveUserProjectScope: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sentryIssueImported: {
      findUnique: mocks.findUnique,
    },
  },
}));

vi.mock("@/lib/reports/scope", () => ({
  resolveUserProjectScope: mocks.resolveUserProjectScope,
}));

vi.mock("@/lib/env", () => ({
  env: {
    sentryProjectMappings: "mobile-app:EPM,backend-api:CICM",
  },
  jiraProjectList: ["DEFAULT"],
  parseSentryMappings: (raw: string) => {
    if (!raw) return [];
    return [
      { sentryProject: "mobile-app", jiraProject: "EPM" },
      { sentryProject: "backend-api", jiraProject: "CICM" },
    ];
  },
  resolveJiraProject: (
    sentryProject: string,
    mappings: Array<{ sentryProject: string; jiraProject: string }>,
    fallback: string | null
  ) => {
    const match = mappings.find((m) => m.sentryProject === sentryProject);
    return match ? match.jiraProject : fallback;
  },
}));

import {
  assertSentryRowAccess,
  hasSentryRowAccess,
  resolveRowTargetProject,
  sentryScopeFor,
  SentryRowAccessError,
} from "./scope";

describe("src/lib/sentry/scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sentryScopeFor", () => {
    it("returns empty projects for unauthenticated session", async () => {
      const scope = await sentryScopeFor(null);
      expect(scope).toEqual({ all: false, projects: [] });
    });

    it("returns all: true for admin user", async () => {
      const scope = await sentryScopeFor({ user: { id: "u-admin", role: "admin" } });
      expect(scope).toEqual({ all: true });
      expect(mocks.resolveUserProjectScope).not.toHaveBeenCalled();
    });

    it("returns allowed projects for regular user", async () => {
      mocks.resolveUserProjectScope.mockResolvedValueOnce({
        allowedProjects: ["EPM", "CICM"],
      });
      const scope = await sentryScopeFor({ user: { id: "u-1", role: "member" } });
      expect(scope).toEqual({ all: false, projects: ["EPM", "CICM"] });
      expect(mocks.resolveUserProjectScope).toHaveBeenCalledWith("u-1", "member");
    });
  });

  describe("resolveRowTargetProject", () => {
    it("returns targetProject if already set", () => {
      expect(
        resolveRowTargetProject({ targetProject: "CUSTOM", sentryProject: "mobile-app" })
      ).toBe("CUSTOM");
    });

    it("resolves from mapping if targetProject is null", () => {
      expect(
        resolveRowTargetProject({ targetProject: null, sentryProject: "mobile-app" })
      ).toBe("EPM");
    });

    it("falls back if unmapped and targetProject is null", () => {
      expect(
        resolveRowTargetProject({ targetProject: null, sentryProject: "unmapped-proj" })
      ).toBe("DEFAULT");
    });
  });

  describe("hasSentryRowAccess", () => {
    it("returns true for admin scope regardless of project", () => {
      expect(
        hasSentryRowAccess({ targetProject: "SECRET", sentryProject: "secret" }, { all: true })
      ).toBe(true);
    });

    it("returns true when targetProject is in user allowed projects", () => {
      expect(
        hasSentryRowAccess(
          { targetProject: "EPM", sentryProject: "other" },
          { all: false, projects: ["EPM"] }
        )
      ).toBe(true);
    });

    it("returns false when targetProject is not in user allowed projects", () => {
      expect(
        hasSentryRowAccess(
          { targetProject: "MHRM", sentryProject: "other" },
          { all: false, projects: ["EPM"] }
        )
      ).toBe(false);
    });

    it("evaluates mapped sentryProject when targetProject is null", () => {
      expect(
        hasSentryRowAccess(
          { targetProject: null, sentryProject: "mobile-app" },
          { all: false, projects: ["EPM"] }
        )
      ).toBe(true);

      expect(
        hasSentryRowAccess(
          { targetProject: null, sentryProject: "mobile-app" },
          { all: false, projects: ["MHRM"] }
        )
      ).toBe(false);
    });
  });

  describe("assertSentryRowAccess", () => {
    it("throws SentryRowAccessError (404) if row does not exist", async () => {
      mocks.findUnique.mockResolvedValueOnce(null);

      await expect(
        assertSentryRowAccess("row-missing", { all: true })
      ).rejects.toThrow(SentryRowAccessError);
    });

    it("returns row for admin scope", async () => {
      const mockRow = { id: "row-1", targetProject: "ANY", sentryProject: "p" };
      mocks.findUnique.mockResolvedValueOnce(mockRow);

      const res = await assertSentryRowAccess("row-1", { all: true });
      expect(res).toBe(mockRow);
    });

    it("throws 404 if row is not in user allowed projects", async () => {
      const mockRow = { id: "row-1", targetProject: "OTHER", sentryProject: "p" };
      mocks.findUnique.mockResolvedValueOnce(mockRow);

      await expect(
        assertSentryRowAccess("row-1", { all: false, projects: ["EPM"] })
      ).rejects.toThrow(SentryRowAccessError);
    });

    it("returns row when in user allowed projects", async () => {
      const mockRow = { id: "row-1", targetProject: "EPM", sentryProject: "p" };
      mocks.findUnique.mockResolvedValueOnce(mockRow);

      const res = await assertSentryRowAccess("row-1", {
        all: false,
        projects: ["EPM"],
      });
      expect(res).toBe(mockRow);
    });
  });
});
