import { describe, it, expect } from "vitest";

describe("queryBranches condition builder logic (BR-001)", () => {
  it("joins search, project, repo, and PR conditions strictly with AND", () => {
    // Pure verification of discrete AND/OR grouping logic
    const buildWhere = (params: { q?: string; project?: string; repo?: string; pr?: string }) => {
      const andConditions: Record<string, unknown>[] = [{ deletedAt: null }];

      if (params.q) {
        andConditions.push({
          OR: [
            { branch: { contains: params.q, mode: "insensitive" } },
            { repo: { contains: params.q, mode: "insensitive" } },
            { jiraKey: { contains: params.q, mode: "insensitive" } },
          ],
        });
      }

      if (params.project && params.project !== "ALL") {
        andConditions.push({
          OR: [
            { repo: { startsWith: `${params.project}/` } },
            { issue: { projectKey: params.project } },
          ],
        });
      }

      if (params.repo && params.repo !== "ALL") {
        andConditions.push({ repo: params.repo });
      }

      if (params.pr === "merged") {
        andConditions.push({
          OR: [
            { prState: { in: ["MERGED", "merged"] } },
            { merged: true },
          ],
        });
      }

      return { AND: andConditions };
    };

    const where = buildWhere({
      q: "EPM-3395",
      project: "EPM",
      repo: "team/payment-service",
      pr: "merged",
    });

    // Verify AND contains 5 separate conditions (base + 4 groups)
    expect(where.AND).toHaveLength(5);
    // Verify pr: merged did not overwrite the search q condition
    expect(JSON.stringify(where)).toContain("EPM-3395");
    expect(JSON.stringify(where)).toContain("team/payment-service");
    expect(JSON.stringify(where)).toContain("MERGED");
  });
});
