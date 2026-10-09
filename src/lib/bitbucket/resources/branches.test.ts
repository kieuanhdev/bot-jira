import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    bitbucketBaseUrl: "http://bitbucket.test",
    bitbucketBaseBranch: "main",
  },
}));

import { createBranchesResource } from "./branches";
import type { BitbucketTransport } from "../transport";

describe("Bitbucket Branches Resource", () => {
  describe("listBranches", () => {
    it("normalizes branch name using displayId when name is missing and filters empty names", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn(),
        fetchPaged: vi.fn().mockResolvedValue([
          { name: "feature/login", latestCommit: "c1" },
          { displayId: "feature/signup", latestCommit: "c2" },
          { id: "refs/heads/", name: "", displayId: "" }, // should be filtered out
        ]),
      };

      const branchesResource = createBranchesResource(mockTransport);
      const branches = await branchesResource.listBranches("PROJ/repo");

      expect(branches).toEqual([
        expect.objectContaining({ name: "feature/login", latestCommit: "c1" }),
        expect.objectContaining({ name: "feature/signup", latestCommit: "c2" }),
      ]);
    });
  });

  describe("getBranch", () => {
    it("returns branch details when branch exists", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn().mockResolvedValue({ name: "main", latestCommit: "abc" }),
        fetchPaged: vi.fn(),
      };

      const branchesResource = createBranchesResource(mockTransport);
      const branch = await branchesResource.getBranch("PROJ/repo", "main");

      expect(branch).toEqual({ name: "main", latestCommit: "abc" });
      expect(mockTransport.request).toHaveBeenCalledWith(
        "PROJ/repo",
        "branches/main",
        {},
        undefined
      );
    });

    it("returns null when Bitbucket returns 404", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn().mockRejectedValue(new Error("Bitbucket branches/not-found -> 404: Not Found")),
        fetchPaged: vi.fn(),
      };

      const branchesResource = createBranchesResource(mockTransport);
      const branch = await branchesResource.getBranch("PROJ/repo", "not-found");

      expect(branch).toBeNull();
    });

    it("rethrows non-404 errors", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn().mockRejectedValue(new Error("Bitbucket branches/bad -> 500: Server Error")),
        fetchPaged: vi.fn(),
      };

      const branchesResource = createBranchesResource(mockTransport);
      await expect(branchesResource.getBranch("PROJ/repo", "bad")).rejects.toThrow("500");
    });
  });

  describe("createBranch", () => {
    it("POSTs branch creation data", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn().mockResolvedValue({
          branch: { name: "feature/new", id: 101 },
          displayId: "feature/new",
        }),
        fetchPaged: vi.fn(),
      };

      const branchesResource = createBranchesResource(mockTransport);
      const result = await branchesResource.createBranch("PROJ/repo", {
        name: "feature/new",
        base: "main",
      });

      expect(result).toEqual({
        branch: { name: "feature/new", id: 101 },
        displayId: "feature/new",
      });
      expect(mockTransport.request).toHaveBeenCalledWith(
        "PROJ/repo",
        "branches",
        {
          method: "POST",
          body: JSON.stringify({ name: "feature/new", base: "main" }),
        },
        undefined
      );
    });
  });

  describe("Commits operations", () => {
    it("getCommit returns commit or null on 404", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn()
          .mockResolvedValueOnce({ id: "c1", message: "Initial commit" })
          .mockRejectedValueOnce(new Error("Bitbucket commits/missing -> 404: Not Found")),
        fetchPaged: vi.fn(),
      };

      const branchesResource = createBranchesResource(mockTransport);

      const commit = await branchesResource.getCommit("PROJ/repo", "c1");
      expect(commit).toEqual({ id: "c1", message: "Initial commit" });

      const missing = await branchesResource.getCommit("PROJ/repo", "missing");
      expect(missing).toBeNull();
    });

    it("listCommits returns commits array and falls back to empty array on error", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn()
          .mockResolvedValueOnce({ values: [{ id: "c1" }, { id: "c2" }] })
          .mockRejectedValueOnce(new Error("Network failure")),
        fetchPaged: vi.fn(),
      };

      const branchesResource = createBranchesResource(mockTransport);

      const commits = await branchesResource.listCommits("PROJ/repo", "main", 5);
      expect(commits).toEqual([{ id: "c1" }, { id: "c2" }]);

      const failed = await branchesResource.listCommits("PROJ/repo", "invalid");
      expect(failed).toEqual([]);
    });

    it("getCommitBranches strips refs/heads/ prefix and returns branch names", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn()
          .mockResolvedValueOnce({
            values: [
              { displayId: "feature/test" },
              { id: "refs/heads/bugfix/fix1" },
              { id: "" },
            ],
          })
          .mockRejectedValueOnce(new Error("Network failure")),
        fetchPaged: vi.fn(),
      };

      const branchesResource = createBranchesResource(mockTransport);

      const branches = await branchesResource.getCommitBranches("PROJ/repo", "c1");
      expect(branches).toEqual(["feature/test", "bugfix/fix1"]);

      const failed = await branchesResource.getCommitBranches("PROJ/repo", "c2");
      expect(failed).toEqual([]);
    });

    it("getDefaultBranch extracts displayId or strips refs/heads/", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn()
          .mockResolvedValueOnce({ displayId: "main" })
          .mockResolvedValueOnce({ id: "refs/heads/master" })
          .mockRejectedValueOnce(new Error("Not found")),
        fetchPaged: vi.fn(),
      };

      const branchesResource = createBranchesResource(mockTransport);

      expect(await branchesResource.getDefaultBranch("PROJ/repo")).toBe("main");
      expect(await branchesResource.getDefaultBranch("PROJ/repo")).toBe("master");
      expect(await branchesResource.getDefaultBranch("PROJ/repo")).toBeNull();
    });
  });

  describe("branchStatus", () => {
    it("filters out base branch and correlates with latest PR", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn(),
        fetchPaged: vi.fn().mockResolvedValue([
          { name: "main" }, // base branch, should be filtered
          { name: "feature/done" },
          { name: "feature/wip" },
        ]),
      };

      const mockListPrs = vi.fn().mockResolvedValue([
        {
          id: 1,
          title: "Feature Done Old",
          state: "DECLINED",
          fromRef: { branch: "feature/done" },
          updatedDate: 100,
        },
        {
          id: 2,
          title: "Feature Done Merged",
          state: "MERGED",
          fromRef: { branch: "feature/done" },
          toRef: { branch: "main" },
          url: "http://bb.test/pr/2",
          updatedDate: 200,
        },
        {
          id: 3,
          title: "Feature WIP",
          state: "OPEN",
          fromRef: { branch: "feature/wip" },
          toRef: { branch: "main" },
          url: "http://bb.test/pr/3",
          updatedDate: 300,
        },
      ]);

      const branchesResource = createBranchesResource(mockTransport, {
        listPullRequests: mockListPrs,
      });

      const status = await branchesResource.branchStatus("PROJ/repo");

      expect(status).toHaveLength(2);

      const doneBranch = status.find((s) => s.branch.name === "feature/done");
      expect(doneBranch).toBeDefined();
      expect(doneBranch?.merged).toBe(true);
      expect(doneBranch?.prTitle).toBe("Feature Done Merged");
      expect(doneBranch?.prUrl).toBe("http://bb.test/pr/2");

      const wipBranch = status.find((s) => s.branch.name === "feature/wip");
      expect(wipBranch).toBeDefined();
      expect(wipBranch?.merged).toBe(false);
      expect(wipBranch?.prState).toBe("OPEN");
    });
  });
});
