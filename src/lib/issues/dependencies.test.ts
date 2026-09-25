import { describe, it, expect, vi, beforeEach } from "vitest";
import { expandDependencies } from "./dependencies";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    issueLinkCache: {
      findMany: vi.fn(),
    },
    issueCache: {
      findMany: vi.fn(),
    },
  },
}));

describe("expandDependencies (DEP-04)", () => {
  const mockFindLinks = (
    fn: (args: { where?: { inwardKey?: { in?: string[] } } }) => Promise<unknown>
  ) =>
    (
      vi.mocked(prisma.issueLinkCache.findMany) as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(fn);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expands single-level and multi-level dependencies via BFS", async () => {
    // Links:
    // PROJ-100 is blocked by PROJ-101 => inwardKey: PROJ-100, outwardKey: PROJ-101
    // PROJ-101 is blocked by PROJ-102 => inwardKey: PROJ-101, outwardKey: PROJ-102
    mockFindLinks(async (args) => {
      const keys = args?.where?.inwardKey?.in ?? [];
      const res: Array<{ inwardKey: string; outwardKey: string }> = [];
      if (keys.includes("PROJ-100")) {
        res.push({ inwardKey: "PROJ-100", outwardKey: "PROJ-101" });
      }
      if (keys.includes("PROJ-101")) {
        res.push({ inwardKey: "PROJ-101", outwardKey: "PROJ-102" });
      }
      return res;
    });

    vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
      { jiraKey: "PROJ-100", summary: "Task 100", projectKey: "PROJ", status: "Done" },
      { jiraKey: "PROJ-101", summary: "Task 101", projectKey: "PROJ", status: "Done" },
      { jiraKey: "PROJ-102", summary: "Task 102", projectKey: "PROJ", status: "Done" },
    ] as never);

    const result = await expandDependencies({ rootKeys: ["PROJ-100"] });

    expect(result.roots).toEqual(["PROJ-100"]);
    expect(result.issues).toHaveLength(3);
    expect(result.issues[0]).toMatchObject({ key: "PROJ-100", depth: 0, relation: "explicit" });
    expect(result.issues[1]).toMatchObject({ key: "PROJ-101", depth: 1, relation: "dependency", via: "PROJ-100" });
    expect(result.issues[2]).toMatchObject({ key: "PROJ-102", depth: 2, relation: "dependency", via: "PROJ-101" });
    expect(result.edges).toEqual([
      { root: "PROJ-100", dependency: "PROJ-101" },
      { root: "PROJ-101", dependency: "PROJ-102" },
    ]);
    expect(result.cycles).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.missingKeys).toEqual([]);
  });

  it("handles multiple roots sharing the same dependency without duplicates", async () => {
    // PROJ-100 is blocked by SHARED-1
    // PROJ-200 is blocked by SHARED-1
    mockFindLinks(async (args) => {
      const keys = args?.where?.inwardKey?.in ?? [];
      const res: Array<{ inwardKey: string; outwardKey: string }> = [];
      if (keys.includes("PROJ-100")) {
        res.push({ inwardKey: "PROJ-100", outwardKey: "SHARED-1" });
      }
      if (keys.includes("PROJ-200")) {
        res.push({ inwardKey: "PROJ-200", outwardKey: "SHARED-1" });
      }
      return res;
    });

    vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
      { jiraKey: "PROJ-100" },
      { jiraKey: "PROJ-200" },
      { jiraKey: "SHARED-1" },
    ] as never);

    const result = await expandDependencies({ rootKeys: ["PROJ-100", "PROJ-200"] });

    expect(result.roots).toEqual(["PROJ-100", "PROJ-200"]);
    // Should contain PROJ-100, PROJ-200, and exactly ONE SHARED-1
    expect(result.issues.map((i) => i.key)).toEqual(["PROJ-100", "PROJ-200", "SHARED-1"]);
    expect(result.edges).toHaveLength(2);
    expect(result.cycles).toEqual([]);
  });

  it("detects dependency cycles and prevents infinite loops", async () => {
    // Cycle: A -> B -> C -> A
    mockFindLinks(async (args) => {
      const keys = args?.where?.inwardKey?.in ?? [];
      const res: Array<{ inwardKey: string; outwardKey: string }> = [];
      if (keys.includes("A")) res.push({ inwardKey: "A", outwardKey: "B" });
      if (keys.includes("B")) res.push({ inwardKey: "B", outwardKey: "C" });
      if (keys.includes("C")) res.push({ inwardKey: "C", outwardKey: "A" });
      return res;
    });

    vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
      { jiraKey: "A" },
      { jiraKey: "B" },
      { jiraKey: "C" },
    ] as never);

    const result = await expandDependencies({ rootKeys: ["A"] });

    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0].path).toEqual(["A", "B", "C", "A"]);
    expect(result.issues.map((i) => i.key)).toEqual(["A", "B", "C"]);
  });

  it("enforces maxDepth and marks truncated = true", async () => {
    // Chain: A -> B -> C
    mockFindLinks(async (args) => {
      const keys = args?.where?.inwardKey?.in ?? [];
      const res: Array<{ inwardKey: string; outwardKey: string }> = [];
      if (keys.includes("A")) res.push({ inwardKey: "A", outwardKey: "B" });
      if (keys.includes("B")) res.push({ inwardKey: "B", outwardKey: "C" });
      return res;
    });

    vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
      { jiraKey: "A" },
      { jiraKey: "B" },
    ] as never);

    // maxDepth = 1 allows A (depth 0) and B (depth 1), but cannot go to C (depth 2)
    const result = await expandDependencies({ rootKeys: ["A"], maxDepth: 1 });

    expect(result.truncated).toBe(true);
    expect(result.issues.map((i) => i.key)).toEqual(["A", "B"]);
  });

  it("enforces maxIssues and marks truncated = true", async () => {
    vi.mocked(prisma.issueLinkCache.findMany).mockResolvedValue([
      { inwardKey: "A", outwardKey: "B" },
      { inwardKey: "A", outwardKey: "C" },
      { inwardKey: "A", outwardKey: "D" },
    ] as never);

    vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
      { jiraKey: "A" },
      { jiraKey: "B" },
    ] as never);

    const result = await expandDependencies({ rootKeys: ["A"], maxIssues: 2 });

    expect(result.truncated).toBe(true);
    expect(result.issues.length).toBe(2);
  });

  it("identifies missingKeys when issue is not in IssueCache", async () => {
    vi.mocked(prisma.issueLinkCache.findMany).mockResolvedValue([
      { inwardKey: "PROJ-1", outwardKey: "MISSING-99" },
    ] as never);

    // Only PROJ-1 is in cache
    vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
      { jiraKey: "PROJ-1" },
    ] as never);

    const result = await expandDependencies({ rootKeys: ["PROJ-1"] });

    expect(result.missingKeys).toEqual(["MISSING-99"]);
    expect(result.issues.find((i) => i.key === "MISSING-99")?.issue).toBeUndefined();
    expect(result.issues.find((i) => i.key === "PROJ-1")?.issue).toBeDefined();
  });
});
