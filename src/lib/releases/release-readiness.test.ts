import { describe, it, expect } from "vitest";
import {
  evaluateTaskReadiness,
  evaluateReleaseReadiness,
  isNoCodeTask,
} from "./release-readiness";

describe("release-readiness", () => {
  describe("isNoCodeTask", () => {
    it("recognizes no-code label case-insensitively", () => {
      expect(isNoCodeTask(["no-code"])).toBe(true);
      expect(isNoCodeTask(["No-Code"])).toBe(true);
      expect(isNoCodeTask(["NO-CODE", "frontend"])).toBe(true);
      expect(isNoCodeTask(["frontend", "backend"])).toBe(false);
      expect(isNoCodeTask([])).toBe(false);
    });

    it("supports custom configured labels", () => {
      expect(isNoCodeTask(["docs-only"], ["no-code", "docs-only"])).toBe(true);
    });
  });

  describe("evaluateTaskReadiness", () => {
    it("marks task as not done if statusCategory is not done", () => {
      const res = evaluateTaskReadiness({
        jiraKey: "EPM-101",
        summary: "Task in review",
        status: "In Review",
        statusCategory: "indeterminate",
        labels: ["no-code"],
      });
      expect(res.isDone).toBe(false);
      expect(res.ready).toBe(false);
      expect(res.blockers).toHaveLength(1);
      expect(res.blockers[0].code).toBe("TASK_NOT_DONE");
    });

    it("does not count status name with 'Done' if statusCategory is not done", () => {
      const res = evaluateTaskReadiness({
        jiraKey: "EPM-102",
        summary: "Almost Done",
        status: "Almost Done",
        statusCategory: "indeterminate",
        labels: ["no-code"],
      });
      expect(res.isDone).toBe(false);
      expect(res.ready).toBe(false);
      expect(res.blockers[0].code).toBe("TASK_NOT_DONE");
    });

    it("allows no-code task to be ready when done without any branches", () => {
      const res = evaluateTaskReadiness({
        jiraKey: "EPM-103",
        summary: "Update copy",
        status: "Done",
        statusCategory: "done",
        labels: ["no-code"],
      });
      expect(res.isDone).toBe(true);
      expect(res.noCode).toBe(true);
      expect(res.gitComplete).toBe(true);
      expect(res.ready).toBe(true);
      expect(res.blockers).toHaveLength(0);
    });

    it("blocks code task without any confirmed branch with NO_CONFIRMED_BRANCH", () => {
      const res = evaluateTaskReadiness({
        jiraKey: "EPM-104",
        summary: "Add API endpoint",
        status: "Done",
        statusCategory: "done",
        labels: [],
        branches: [],
      });
      expect(res.isDone).toBe(true);
      expect(res.noCode).toBe(false);
      expect(res.gitComplete).toBe(false);
      expect(res.ready).toBe(false);
      expect(res.blockers[0].code).toBe("NO_CONFIRMED_BRANCH");
    });

    it("blocks code task with only suggested branch with BRANCH_LINK_UNCONFIRMED", () => {
      const res = evaluateTaskReadiness({
        jiraKey: "EPM-105",
        summary: "Add UI feature",
        status: "Done",
        statusCategory: "done",
        labels: [],
        branches: [
          {
            repo: "web-app",
            branch: "feature/EPM-105",
            linkState: "suggested",
            merged: true,
            prState: "MERGED",
          },
        ],
      });
      expect(res.gitComplete).toBe(false);
      expect(res.ready).toBe(false);
      expect(res.blockers[0].code).toBe("BRANCH_LINK_UNCONFIRMED");
    });

    it("blocks confirmed branch with no pull request with NO_PULL_REQUEST", () => {
      const res = evaluateTaskReadiness({
        jiraKey: "EPM-106",
        summary: "Database migration",
        status: "Done",
        statusCategory: "done",
        branches: [
          {
            repo: "api-service",
            branch: "feature/EPM-106",
            linkState: "confirmed",
            prId: null,
            prUrl: null,
            merged: false,
          },
        ],
      });
      expect(res.gitComplete).toBe(false);
      expect(res.blockers[0].code).toBe("NO_PULL_REQUEST");
    });

    it("blocks confirmed branch with PR OPEN with PR_NOT_MERGED", () => {
      const res = evaluateTaskReadiness({
        jiraKey: "EPM-107",
        summary: "Refactor auth",
        status: "Done",
        statusCategory: "done",
        branches: [
          {
            repo: "api-service",
            branch: "feature/EPM-107",
            linkState: "confirmed",
            prId: 42,
            prUrl: "https://bitbucket.org/team/repo/pull-requests/42",
            prState: "OPEN",
            merged: false,
          },
        ],
      });
      expect(res.gitComplete).toBe(false);
      expect(res.blockers[0].code).toBe("PR_NOT_MERGED");
    });

    it("does not treat CLOSED or DECLINED as merged unless merged flag is true and state is MERGED", () => {
      const res = evaluateTaskReadiness({
        jiraKey: "EPM-108",
        summary: "Closed unmerged PR",
        status: "Done",
        statusCategory: "done",
        branches: [
          {
            repo: "api-service",
            branch: "feature/EPM-108",
            linkState: "confirmed",
            prId: 43,
            prUrl: "https://bitbucket.org/team/repo/pull-requests/43",
            prState: "CLOSED",
            merged: false,
          },
        ],
      });
      expect(res.gitComplete).toBe(false);
      expect(res.blockers[0].code).toBe("PR_NOT_MERGED");
    });

    const mergedElsewhere = (over: Record<string, unknown> = {}) => ({
      repo: "api-service",
      branch: "feature/login-rework",
      linkState: "confirmed",
      prId: 44,
      prTitle: "Login rework",
      prUrl: "https://bitbucket.org/team/repo/pull-requests/44",
      prState: "MERGED",
      prDestinationBranch: "dev-feature-branch",
      merged: true,
      ...over,
    });
    const evalWith = (branch: ReturnType<typeof mergedElsewhere>) =>
      evaluateTaskReadiness(
        { jiraKey: "EPM-109", summary: "Feature merge", status: "Done", statusCategory: "done", branches: [branch] },
        { allowedDestinations: ["main", "master"] }
      );

    it("blocks a merged PR into an unlisted branch when nothing ties it to the task key", () => {
      const res = evalWith(mergedElsewhere());
      expect(res.gitComplete).toBe(false);
      expect(res.blockers[0].code).toBe("WRONG_MERGE_DESTINATION");
    });

    it("accepts a merged PR into any branch when the PR title carries the task key", () => {
      const res = evalWith(mergedElsewhere({ prTitle: "EPM-109: login rework" }));
      expect(res.gitComplete).toBe(true);
      expect(res.blockers).toHaveLength(0);
    });

    it("accepts a merged PR into any branch when the branch name carries the task key", () => {
      const res = evalWith(mergedElsewhere({ branch: "feat/EPM-109" }));
      expect(res.gitComplete).toBe(true);
      expect(res.blockers).toHaveLength(0);
    });

    it("does not confuse EPM-1090 with EPM-109", () => {
      const res = evalWith(mergedElsewhere({ prTitle: "EPM-1090 other work" }));
      expect(res.blockers[0]?.code).toBe("WRONG_MERGE_DESTINATION");
    });

    it("still blocks an OPEN PR even if its title carries the key", () => {
      const res = evalWith(
        mergedElsewhere({ prTitle: "EPM-109 wip", prState: "OPEN", merged: false })
      );
      expect(res.gitComplete).toBe(false);
      expect(res.blockers[0].code).toBe("PR_NOT_MERGED");
    });

    it("blocks if git data is stale or unavailable for code task", () => {
      const staleRes = evaluateTaskReadiness(
        {
          jiraKey: "EPM-110",
          summary: "Stale data task",
          status: "Done",
          statusCategory: "done",
          branches: [
            {
              repo: "repo",
              branch: "feature/1",
              linkState: "confirmed",
              prId: 1,
              merged: true,
              prState: "MERGED",
            },
          ],
        },
        { gitDataFresh: false }
      );
      expect(staleRes.gitComplete).toBe(false);
      expect(staleRes.blockers[0].code).toBe("GIT_DATA_STALE");

      const unavailRes = evaluateTaskReadiness(
        {
          jiraKey: "EPM-111",
          summary: "Unavailable git task",
          status: "Done",
          statusCategory: "done",
          branches: [],
        },
        { gitUnavailable: true }
      );
      expect(unavailRes.gitComplete).toBe(false);
      expect(unavailRes.blockers[0].code).toBe("GIT_UNAVAILABLE");
    });

    it("requires ALL confirmed branches to be merged when task has multiple branches", () => {
      const res = evaluateTaskReadiness({
        jiraKey: "EPM-112",
        summary: "Multi-repo task",
        status: "Done",
        statusCategory: "done",
        branches: [
          {
            repo: "web-frontend",
            branch: "feature/EPM-112",
            linkState: "confirmed",
            prId: 50,
            prState: "MERGED",
            merged: true,
          },
          {
            repo: "api-backend",
            branch: "feature/EPM-112",
            linkState: "confirmed",
            prId: 51,
            prState: "OPEN",
            merged: false,
          },
        ],
      });
      expect(res.gitComplete).toBe(false);
      expect(res.ready).toBe(false);
      expect(res.blockers).toHaveLength(1);
      expect(res.blockers[0].code).toBe("PR_NOT_MERGED");
      expect(res.blockers[0].repo).toBe("api-backend");
    });

    it("marks ready when Done and all confirmed branches are merged", () => {
      const res = evaluateTaskReadiness({
        jiraKey: "EPM-113",
        summary: "Complete feature",
        status: "Done",
        statusCategory: "done",
        branches: [
          {
            repo: "web-frontend",
            branch: "feature/EPM-113",
            linkState: "confirmed",
            prId: 60,
            prState: "MERGED",
            merged: true,
          },
        ],
      });
      expect(res.isDone).toBe(true);
      expect(res.gitComplete).toBe(true);
      expect(res.ready).toBe(true);
      expect(res.blockers).toHaveLength(0);
    });

    it("marks ready when task has an intermediate branch without PR but final branch is merged", () => {
      const res = evaluateTaskReadiness({
        jiraKey: "EPM-114",
        summary: "Superseded branch task",
        status: "Done",
        statusCategory: "done",
        branches: [
          {
            repo: "web-frontend",
            branch: "feature/EPM-114-wip",
            linkState: "confirmed",
            prId: null,
            merged: false,
          },
          {
            repo: "web-frontend",
            branch: "feature/EPM-114-final",
            linkState: "confirmed",
            prId: 92,
            prState: "MERGED",
            prDestinationBranch: "dev",
            merged: true,
          },
        ],
      });
      expect(res.isDone).toBe(true);
      expect(res.gitComplete).toBe(true);
      expect(res.ready).toBe(true);
      expect(res.blockers).toHaveLength(0);
    });

    it("marks ready when an earlier PR was declined but a subsequent PR is merged", () => {
      const res = evaluateTaskReadiness({
        jiraKey: "EPM-115",
        summary: "Declined then merged task",
        status: "Done",
        statusCategory: "done",
        branches: [
          {
            repo: "web-frontend",
            branch: "feature/EPM-115-old",
            linkState: "confirmed",
            prId: 90,
            prState: "DECLINED",
            merged: false,
          },
          {
            repo: "web-frontend",
            branch: "feature/EPM-115-new",
            linkState: "confirmed",
            prId: 91,
            prState: "MERGED",
            prDestinationBranch: "dev",
            merged: true,
          },
        ],
      });
      expect(res.isDone).toBe(true);
      expect(res.gitComplete).toBe(true);
      expect(res.ready).toBe(true);
      expect(res.blockers).toHaveLength(0);
    });
  });

  describe("evaluateReleaseReadiness", () => {
    it("returns empty if taskCount is 0 and not released", () => {
      const res = evaluateReleaseReadiness({ jiraReleased: false }, []);
      expect(res.state).toBe("empty");
      expect(res.taskCount).toBe(0);
    });

    it("returns released if jiraReleased is true", () => {
      const res = evaluateReleaseReadiness({ jiraReleased: true }, []);
      expect(res.state).toBe("released");
    });

    it("returns in_progress when 1 of 3 tasks is Done", () => {
      const t1 = evaluateTaskReadiness({
        jiraKey: "T-1",
        summary: "1",
        status: "Done",
        statusCategory: "done",
        labels: ["no-code"],
      });
      const t2 = evaluateTaskReadiness({
        jiraKey: "T-2",
        summary: "2",
        status: "In Progress",
        statusCategory: "indeterminate",
        labels: ["no-code"],
      });
      const t3 = evaluateTaskReadiness({
        jiraKey: "T-3",
        summary: "3",
        status: "To Do",
        statusCategory: "new",
        labels: ["no-code"],
      });

      const res = evaluateReleaseReadiness({ jiraReleased: false }, [t1, t2, t3]);
      expect(res.state).toBe("in_progress");
      expect(res.taskCount).toBe(3);
      expect(res.doneCount).toBe(1);
      expect(res.deliveryReadyCount).toBe(1);
    });

    it("returns in_progress when 3 of 3 are Done in Jira but 1 PR is OPEN", () => {
      const t1 = evaluateTaskReadiness({
        jiraKey: "T-1",
        summary: "1",
        status: "Done",
        statusCategory: "done",
        labels: ["no-code"],
      });
      const t2 = evaluateTaskReadiness({
        jiraKey: "T-2",
        summary: "2",
        status: "Done",
        statusCategory: "done",
        branches: [
          {
            repo: "web",
            branch: "feat/2",
            linkState: "confirmed",
            prId: 1,
            merged: true,
            prState: "MERGED",
          },
        ],
      });
      const t3 = evaluateTaskReadiness({
        jiraKey: "T-3",
        summary: "3",
        status: "Done",
        statusCategory: "done",
        branches: [
          {
            repo: "web",
            branch: "feat/3",
            linkState: "confirmed",
            prId: 2,
            merged: false,
            prState: "OPEN",
          },
        ],
      });

      const res = evaluateReleaseReadiness({ jiraReleased: false }, [t1, t2, t3]);
      expect(res.state).toBe("in_progress");
      expect(res.taskCount).toBe(3);
      expect(res.doneCount).toBe(3);
      expect(res.gitCompleteCount).toBe(2);
      expect(res.deliveryReadyCount).toBe(2);
      expect(res.blockers).toHaveLength(1);
      expect(res.blockers[0].code).toBe("PR_NOT_MERGED");
    });

    it("returns ready when 3 of 3 are Done and git complete", () => {
      const t1 = evaluateTaskReadiness({
        jiraKey: "T-1",
        summary: "1",
        status: "Done",
        statusCategory: "done",
        labels: ["no-code"],
      });
      const t2 = evaluateTaskReadiness({
        jiraKey: "T-2",
        summary: "2",
        status: "Done",
        statusCategory: "done",
        branches: [
          {
            repo: "web",
            branch: "feat/2",
            linkState: "confirmed",
            prId: 1,
            merged: true,
            prState: "MERGED",
          },
        ],
      });

      const res = evaluateReleaseReadiness({ jiraReleased: false }, [t1, t2]);
      expect(res.state).toBe("ready");
      expect(res.taskCount).toBe(2);
      expect(res.doneCount).toBe(2);
      expect(res.deliveryReadyCount).toBe(2);
      expect(res.blockers).toHaveLength(0);
    });
  });
});
