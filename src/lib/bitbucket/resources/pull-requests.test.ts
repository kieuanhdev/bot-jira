import { describe, expect, it, vi } from "vitest";
import {
  createPullRequestsResource,
  normalizePullRequest,
} from "./pull-requests";
import type { BitbucketTransport } from "../transport";

describe("Bitbucket Pull Requests Resource", () => {
  describe("normalizePullRequest", () => {
    it("extracts URL from links.self array and normalizes branch references", () => {
      const raw = {
        id: 123,
        fromRef: { displayId: "feature/abc" },
        toRef: { displayId: "main" },
        links: {
          self: [{ href: "http://bitbucket.test/pr/123" }],
        },
      };

      const normalized = normalizePullRequest(raw);
      expect(normalized.url).toBe("http://bitbucket.test/pr/123");
      expect(normalized.fromRef.branch).toBe("feature/abc");
      expect(normalized.toRef?.branch).toBe("main");
    });

    it("extracts URL from links.self object and prefers branch over displayId", () => {
      const raw = {
        id: 456,
        fromRef: { branch: "bugfix/1", displayId: "ignored" },
        toRef: { branch: "develop", displayId: "ignored" },
        links: {
          self: { href: "http://bitbucket.test/pr/456" },
        },
      };

      const normalized = normalizePullRequest(raw);
      expect(normalized.url).toBe("http://bitbucket.test/pr/456");
      expect(normalized.fromRef.branch).toBe("bugfix/1");
      expect(normalized.toRef?.branch).toBe("develop");
    });

    it("handles missing links or toRef gracefully", () => {
      const raw = {
        id: 789,
        fromRef: { displayId: "feature/alone" },
      };

      const normalized = normalizePullRequest(raw);
      expect(normalized.url).toBeUndefined();
      expect(normalized.fromRef.branch).toBe("feature/alone");
      expect(normalized.toRef).toBeUndefined();
    });
  });

  describe("Pull Request operations", () => {
    it("listPullRequests calls pull-requests?state=ALL", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn(),
        fetchPaged: vi.fn().mockResolvedValue([
          {
            id: 1,
            fromRef: { displayId: "feat/1" },
            links: { self: [{ href: "http://bb/1" }] },
          },
        ]),
      };

      const prResource = createPullRequestsResource(mockTransport);
      const prs = await prResource.listPullRequests("PROJ/repo");

      expect(prs).toHaveLength(1);
      expect(prs[0].url).toBe("http://bb/1");
      expect(mockTransport.fetchPaged).toHaveBeenCalledWith(
        "PROJ/repo",
        "pull-requests?state=ALL",
        undefined,
        500
      );
    });

    it("listOpenPullRequests calls pull-requests?state=OPEN", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn(),
        fetchPaged: vi.fn().mockResolvedValue([]),
      };

      const prResource = createPullRequestsResource(mockTransport);
      await prResource.listOpenPullRequests("PROJ/repo");

      expect(mockTransport.fetchPaged).toHaveBeenCalledWith(
        "PROJ/repo",
        "pull-requests?state=OPEN",
        undefined
      );
    });

    it("getPullRequest returns normalized PR or null on 404", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn()
          .mockResolvedValueOnce({
            id: 10,
            fromRef: { displayId: "branch" },
          })
          .mockRejectedValueOnce(new Error("Bitbucket pull-requests/99 -> 404: Not Found")),
        fetchPaged: vi.fn(),
      };

      const prResource = createPullRequestsResource(mockTransport);

      const pr = await prResource.getPullRequest("PROJ/repo", 10);
      expect(pr?.id).toBe(10);

      const missing = await prResource.getPullRequest("PROJ/repo", 99);
      expect(missing).toBeNull();
    });

    it("createPullRequest formats refs and reviewers for Bitbucket Data Center", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn().mockResolvedValue({
          id: 55,
          fromRef: { branch: "feat/foo" },
          toRef: { branch: "main" },
        }),
        fetchPaged: vi.fn(),
      };

      const prResource = createPullRequestsResource(mockTransport);
      const pr = await prResource.createPullRequest("PROJ/repo", {
        title: "PR Title",
        description: "PR Description",
        from: "feat/foo",
        to: "main",
        reviewers: ["alice", "bob"],
      });

      expect(pr.id).toBe(55);
      expect(mockTransport.request).toHaveBeenCalledWith(
        "PROJ/repo",
        "pull-requests",
        {
          method: "POST",
          body: JSON.stringify({
            title: "PR Title",
            description: "PR Description",
            fromRef: {
              id: "refs/heads/feat/foo",
              repository: { slug: "repo", project: { key: "PROJ" } },
            },
            toRef: {
              id: "refs/heads/main",
              repository: { slug: "repo", project: { key: "PROJ" } },
            },
            reviewers: [{ user: { name: "alice" } }, { user: { name: "bob" } }],
          }),
        },
        undefined
      );
    });

    it("updatePullRequest sends PUT with version and fields", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn().mockResolvedValue(undefined),
        fetchPaged: vi.fn(),
      };

      const prResource = createPullRequestsResource(mockTransport);
      await prResource.updatePullRequest("PROJ/repo", 55, {
        version: 3,
        title: "Updated Title",
        description: "New Desc",
        reviewers: [{ user: { name: "alice" } }],
      });

      expect(mockTransport.request).toHaveBeenCalledWith(
        "PROJ/repo",
        "pull-requests/55",
        {
          method: "PUT",
          body: JSON.stringify({
            version: 3,
            title: "Updated Title",
            description: "New Desc",
            reviewers: [{ user: { name: "alice" } }],
          }),
        },
        undefined
      );
    });

    it("listPullRequestActivities calls activities endpoint paged", async () => {
      const mockTransport: BitbucketTransport = {
        request: vi.fn(),
        fetchPaged: vi.fn().mockResolvedValue([{ id: 1, action: "COMMENTED" }]),
      };

      const prResource = createPullRequestsResource(mockTransport);
      const activities = await prResource.listPullRequestActivities("PROJ/repo", 12);

      expect(activities).toEqual([{ id: 1, action: "COMMENTED" }]);
      expect(mockTransport.fetchPaged).toHaveBeenCalledWith(
        "PROJ/repo",
        "pull-requests/12/activities",
        undefined
      );
    });
  });
});
