import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveFilterKeys, resolveSelectorKeys } from "./selection";
import { prisma } from "@/lib/prisma";
import { MAX_FILTER_KEYS } from "./contracts";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    issueCache: {
      findMany: vi.fn(),
    },
  },
}));

describe("Bulk selection (resolveFilterKeys & resolveSelectorKeys)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveFilterKeys", () => {
    it("queries issues with trimmed and uppercased projectKey and deletedAt: null", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
        { jiraKey: "EPM-1" },
        { jiraKey: "EPM-2" },
      ] as never);

      const keys = await resolveFilterKeys("  epm  ", {});
      expect(keys).toEqual(["EPM-1", "EPM-2"]);
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          projectKey: "EPM",
        },
        select: { jiraKey: true },
        orderBy: { jiraKey: "asc" },
        take: MAX_FILTER_KEYS,
      });
    });

    it("applies single and multiple status filters", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([{ jiraKey: "EPM-1" }] as never);

      await resolveFilterKeys("EPM", { statuses: ["In Progress"] });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "In Progress" }),
        })
      );

      await resolveFilterKeys("EPM", { statuses: ["To Do", "In Progress"] });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ["To Do", "In Progress"] } }),
        })
      );
    });

    it("applies single and multiple priority filters", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([{ jiraKey: "EPM-1" }] as never);

      await resolveFilterKeys("EPM", { priorities: ["High"] });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ priority: "High" }),
        })
      );

      await resolveFilterKeys("EPM", { priorities: ["High", "Highest"] });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ priority: { in: ["High", "Highest"] } }),
        })
      );
    });

    it("applies single and multiple labels filters", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([{ jiraKey: "EPM-1" }] as never);

      await resolveFilterKeys("EPM", { labels: ["backend"] });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ labels: { has: "backend" } }),
        })
      );

      await resolveFilterKeys("EPM", { labels: ["backend", "frontend"] });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ labels: { hasSome: ["backend", "frontend"] } }),
        })
      );
    });

    it("applies search query 'q' on jiraKey and summary", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([{ jiraKey: "EPM-1" }] as never);

      await resolveFilterKeys("EPM", { q: "  login bug  " });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { jiraKey: { contains: "login bug", mode: "insensitive" } },
              { summary: { contains: "login bug", mode: "insensitive" } },
            ],
          }),
        })
      );
    });

    it("ignores assignees filter when ALL or empty array", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([{ jiraKey: "EPM-1" }] as never);

      await resolveFilterKeys("EPM", { assignees: "ALL" });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, projectKey: "EPM" },
        })
      );

      await resolveFilterKeys("EPM", { assignees: ["ALL"] });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, projectKey: "EPM" },
        })
      );

      await resolveFilterKeys("EPM", { assignees: [] });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, projectKey: "EPM" },
        })
      );
    });

    it("filters by specific assignees and resolves 'me' to jiraUsername", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([{ jiraKey: "EPM-1" }] as never);

      await resolveFilterKeys("EPM", { assignees: ["alice", "me"] }, "current.user");
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assigneeJira: { in: ["alice", "current.user"] },
          }),
        })
      );
    });

    it("filters by unassigned / none", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([{ jiraKey: "EPM-1" }] as never);

      await resolveFilterKeys("EPM", { assignees: ["unassigned"] });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ assigneeJira: null }, { assigneeJira: "" }],
          }),
        })
      );

      await resolveFilterKeys("EPM", { assignees: ["none"] });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ assigneeJira: null }, { assigneeJira: "" }],
          }),
        })
      );
    });

    it("combines named assignees and unassigned conditions", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([{ jiraKey: "EPM-1" }] as never);

      await resolveFilterKeys("EPM", { assignees: ["alice", "unassigned"] });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { assigneeJira: { in: ["alice"] } },
              { assigneeJira: null },
              { assigneeJira: "" },
            ],
          }),
        })
      );
    });

    it("merges search query OR and assignee OR conditions into where.AND", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([{ jiraKey: "EPM-1" }] as never);

      await resolveFilterKeys("EPM", { q: "auth", assignees: ["unassigned"] });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            projectKey: "EPM",
            AND: [
              {
                OR: [
                  { jiraKey: { contains: "auth", mode: "insensitive" } },
                  { summary: { contains: "auth", mode: "insensitive" } },
                ],
              },
              {
                OR: [{ assigneeJira: null }, { assigneeJira: "" }],
              },
            ],
          }),
        })
      );
    });

    it("merges search query OR and mixed named+unassigned into where.AND", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([{ jiraKey: "EPM-1" }] as never);

      await resolveFilterKeys("EPM", { q: "auth", assignees: ["bob", "none"] });
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              {
                OR: [
                  { jiraKey: { contains: "auth", mode: "insensitive" } },
                  { summary: { contains: "auth", mode: "insensitive" } },
                ],
              },
              {
                OR: [
                  { assigneeJira: { in: ["bob"] } },
                  { assigneeJira: null },
                  { assigneeJira: "" },
                ],
              },
            ],
          }),
        })
      );
    });

    it("filters by epics (specific epic, unassigned, mixed) from raw issue payload", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
        { jiraKey: "EPM-1", raw: { epic: { key: "EPM-10" } } },
        { jiraKey: "EPM-2", raw: { epic: { key: "EPM-20" } } },
        { jiraKey: "EPM-3", raw: {} },
        { jiraKey: "EPM-4", raw: null },
      ] as never);

      const specific = await resolveFilterKeys("EPM", { epics: ["EPM-10"] });
      expect(specific).toEqual(["EPM-1"]);

      const unassigned = await resolveFilterKeys("EPM", { epics: ["none"] });
      expect(unassigned).toEqual(["EPM-3", "EPM-4"]);

      const mixed = await resolveFilterKeys("EPM", { epics: ["EPM-20", "unassigned"] });
      expect(mixed).toEqual(["EPM-2", "EPM-3", "EPM-4"]);
    });

    it("respects custom maxKeys limit", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([{ jiraKey: "EPM-1" }] as never);

      await resolveFilterKeys("EPM", {}, null, 42);
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 42,
        })
      );
    });
  });

  describe("resolveSelectorKeys", () => {
    it("returns keys directly for mode: 'keys' without calling database", async () => {
      const keys = await resolveSelectorKeys({
        mode: "keys",
        keys: ["EPM-1", "EPM-2"],
      });

      expect(keys).toEqual(["EPM-1", "EPM-2"]);
      expect(prisma.issueCache.findMany).not.toHaveBeenCalled();
    });

    it("resolves filter for mode: 'filter' using resolveFilterKeys", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
        { jiraKey: "EPM-10" },
      ] as never);

      const keys = await resolveSelectorKeys(
        {
          mode: "filter",
          project: "EPM",
          filters: { statuses: ["Done"] },
        },
        "test.user",
        100
      );

      expect(keys).toEqual(["EPM-10"]);
      expect(prisma.issueCache.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectKey: "EPM",
            status: "Done",
          }),
          take: 100,
        })
      );
    });
  });
});
