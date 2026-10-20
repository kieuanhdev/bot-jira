import { describe, it, expect } from "vitest";
import {
  generateCheerMessage,
  resolveCompletionDate,
  calculateLeaderboard,
  isExcludedLeaderboardUser,
  type RawLeaderboardIssue,
  type LeaderboardDbUser,
} from "./calculator";
import { computePeriodBounds } from "./period";

describe("Leaderboard Calculator", () => {
  describe("generateCheerMessage", () => {
    it("returns supreme message for rank 1", () => {
      const msg = generateCheerMessage(1, 100, null, null, 10);
      expect(msg).toContain("👑 Đạo hạnh thông thiên");
    });

    it("returns urgent chase message for rank 2-3 when close to higher rank", () => {
      const msg = generateCheerMessage(2, 80, 4, { displayName: "Top1" }, 10);
      expect(msg).toContain("🔥 Đạo hạnh thâm hậu");
      expect(msg).toContain("4 tu vi");
    });

    it("returns encouragement for rank 2-3 when far from higher rank", () => {
      const msg = generateCheerMessage(3, 50, 15, { displayName: "Top2" }, 10);
      expect(msg).toContain("🎉 Tuyệt đỉnh chân nhân");
    });

    it("encourages overtaking next rank user when within 3 points", () => {
      const msg = generateCheerMessage(5, 30, 2, { displayName: "Senior Dev" }, 10);
      expect(msg).toContain("⚡ Khoảng cách với đạo hữu Senior Dev chỉ là 2 tu vi");
    });

    it("notifies when close to next cultivation realm breakthrough", () => {
      const msg = generateCheerMessage(6, 40, 10, { displayName: "Peer" }, 4);
      expect(msg).toContain("✨ Chỉ còn 4 point tu vi nữa là độ kiếp");
    });

    it("encourages beginner with 0 points", () => {
      const msg = generateCheerMessage(10, 0, null, null, 10);
      expect(msg).toContain("🎯 Đạo hữu hiện tại là Phàm Nhân");
    });

    it("returns general rank message otherwise", () => {
      const msg = generateCheerMessage(8, 20, 12, { displayName: "Other" }, 15);
      expect(msg).toContain("💪 Bạn đang ở thứ hạng #8");
    });
  });

  describe("resolveCompletionDate", () => {
    const baseIssue: RawLeaderboardIssue = {
      jiraKey: "TEST-1",
      summary: "Test",
      status: "Done",
      statusCategory: "done",
      statusChangedAt: new Date("2026-10-03T00:00:00Z"),
      updatedAt: new Date("2026-10-04T00:00:00Z"),
      createdAt: new Date("2026-10-01T00:00:00Z"),
      assigneeJira: "alice",
      points: 5,
      priority: "High",
      projectKey: "TEST",
    };

    it("prioritizes customfield_10706 Done At over all other dates", () => {
      const issue: RawLeaderboardIssue = {
        ...baseIssue,
        raw: {
          customfield_10706: "2026-10-15T12:00:00.000Z",
          resolutiondate: "2026-10-10T12:00:00.000Z",
        },
      };
      expect(resolveCompletionDate(issue)?.toISOString()).toBe("2026-10-15T12:00:00.000Z");
    });

    it("falls back to resolutiondate when customfield_10706 is missing", () => {
      const issue: RawLeaderboardIssue = {
        ...baseIssue,
        raw: {
          resolutiondate: "2026-10-10T12:00:00.000Z",
        },
      };
      expect(resolveCompletionDate(issue)?.toISOString()).toBe("2026-10-10T12:00:00.000Z");
    });

    it("falls back to statusChangedAt when raw dates are missing", () => {
      expect(resolveCompletionDate(baseIssue)?.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    });

    it("falls back to updatedAt when statusChangedAt is null", () => {
      const issue: RawLeaderboardIssue = {
        ...baseIssue,
        statusChangedAt: null,
      };
      expect(resolveCompletionDate(issue)?.toISOString()).toBe("2026-10-04T00:00:00.000Z");
    });
  });

  describe("isExcludedLeaderboardUser", () => {
    it("returns true for quangtn_mb and its variants", () => {
      expect(isExcludedLeaderboardUser("quangtn_mb")).toBe(true);
      expect(isExcludedLeaderboardUser("quangtn")).toBe(true);
      expect(isExcludedLeaderboardUser("QUANGTN_MB")).toBe(true);
      expect(isExcludedLeaderboardUser("quangtn_mb@vnpay.vn")).toBe(true);
      expect(isExcludedLeaderboardUser("quangtn@company.com")).toBe(true);
    });

    it("returns true for hoangld and its variants", () => {
      expect(isExcludedLeaderboardUser("hoangld")).toBe(true);
      expect(isExcludedLeaderboardUser("hoangld_mb")).toBe(true);
      expect(isExcludedLeaderboardUser("HOANGLD")).toBe(true);
      expect(isExcludedLeaderboardUser("hoangld@vnpay.vn")).toBe(true);
    });

    it("returns true for tinhvt and its variants", () => {
      expect(isExcludedLeaderboardUser("tinhvt")).toBe(true);
      expect(isExcludedLeaderboardUser("tinhvt_mb")).toBe(true);
      expect(isExcludedLeaderboardUser("TINHVT")).toBe(true);
      expect(isExcludedLeaderboardUser("tinhvt@vnpay.vn")).toBe(true);
    });

    it("returns true for ducpm2 and its variants", () => {
      expect(isExcludedLeaderboardUser("ducpm2")).toBe(true);
      expect(isExcludedLeaderboardUser("ducpm2_mb")).toBe(true);
      expect(isExcludedLeaderboardUser("DUCPM2")).toBe(true);
      expect(isExcludedLeaderboardUser("ducpm2@vnpay.vn")).toBe(true);
    });

    it("returns true for binhht and its variants", () => {
      expect(isExcludedLeaderboardUser("binhht")).toBe(true);
      expect(isExcludedLeaderboardUser("binhht_mb")).toBe(true);
      expect(isExcludedLeaderboardUser("BINHHT")).toBe(true);
      expect(isExcludedLeaderboardUser("binhht@vnpay.vn")).toBe(true);
    });

    it("returns true for HungKD_CIC and its variants", () => {
      expect(isExcludedLeaderboardUser("HungKD_CIC")).toBe(true);
      expect(isExcludedLeaderboardUser("hungkd_cic")).toBe(true);
      expect(isExcludedLeaderboardUser("hungkd_cic_mb")).toBe(true);
      expect(isExcludedLeaderboardUser("hungkd")).toBe(true);
      expect(isExcludedLeaderboardUser("hungkd@vnpay.vn")).toBe(true);
    });

    it("returns false for regular users", () => {
      expect(isExcludedLeaderboardUser("alice")).toBe(false);
      expect(isExcludedLeaderboardUser("bob")).toBe(false);
      expect(isExcludedLeaderboardUser("charlie_mb")).toBe(false);
    });

    it("returns false for empty, null, or undefined values", () => {
      expect(isExcludedLeaderboardUser(null)).toBe(false);
      expect(isExcludedLeaderboardUser(undefined)).toBe(false);
      expect(isExcludedLeaderboardUser("")).toBe(false);
      expect(isExcludedLeaderboardUser("   ")).toBe(false);
    });
  });

  describe("calculateLeaderboard", () => {
    const period = computePeriodBounds("month", 2026, 10);

    const dbUsers: LeaderboardDbUser[] = [
      {
        id: "u1",
        displayName: "Alice Tu Tien",
        jiraUsername: "alice",
        email: "alice@example.com",
        role: "developer",
      },
      {
        id: "u2",
        displayName: "Bob Dao Nhan",
        jiraUsername: "bob",
        email: "bob@example.com",
        role: "developer",
      },
      {
        id: "u3",
        displayName: "Charlie Pham Nhan",
        jiraUsername: "charlie",
        email: "charlie@example.com",
        role: "designer",
      },
    ];

    it("handles empty issues list cleanly, assigning Phàm Nhân tier to all registered team users", () => {
      const result = calculateLeaderboard({
        period,
        issues: [],
        dbUsers,
        myAliases: ["alice"],
        activeProjects: ["PROJ"],
        selectedProject: "PROJ",
      });

      expect(result.members.length).toBe(3);
      expect(result.summary.totalTeamPoints).toBe(0);
      expect(result.summary.totalTeamTasks).toBe(0);
      expect(result.summary.activeMembersCount).toBe(0);
      expect(result.summary.averagePointsPerMember).toBe(0);
      expect(result.summary.topPerformer).toBeNull();
      expect(result.myPerformance?.tier.id).toBe("pham_nhan");
      expect(result.myPerformance?.rank).toBeDefined();
    });

    it("aggregates completed and in-progress points and sorts members with tie breaking", () => {
      const issues: RawLeaderboardIssue[] = [
        // Alice: 8 points completed in Oct
        {
          jiraKey: "P-1",
          summary: "Feature A",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: new Date("2026-10-10T10:00:00Z"),
          updatedAt: new Date("2026-10-10T10:00:00Z"),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          assigneeJira: "alice",
          points: 5,
          priority: "High",
          projectKey: "PROJ",
        },
        {
          jiraKey: "P-2",
          summary: "Feature B",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: new Date("2026-10-15T10:00:00Z"),
          updatedAt: new Date("2026-10-15T10:00:00Z"),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          assigneeJira: "alice_mb", // mobile alias normalized
          points: 3,
          priority: "Medium",
          projectKey: "PROJ",
        },
        // Alice: 2 points in progress
        {
          jiraKey: "P-3",
          summary: "In progress A",
          status: "In Progress",
          statusCategory: "indeterminate",
          statusChangedAt: new Date("2026-10-18T10:00:00Z"),
          updatedAt: new Date("2026-10-18T10:00:00Z"),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          assigneeJira: "alice",
          points: 2,
          priority: "Low",
          projectKey: "PROJ",
        },
        // Bob: 8 points completed in Oct (tied points with Alice, but only 1 task vs Alice's 2 tasks)
        {
          jiraKey: "P-4",
          summary: "Feature Big",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: new Date("2026-10-12T10:00:00Z"),
          updatedAt: new Date("2026-10-12T10:00:00Z"),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          assigneeJira: "bob",
          points: 8,
          priority: "Highest",
          projectKey: "PROJ",
        },
        // Task completed in September (should NOT count in October leaderboard)
        {
          jiraKey: "P-5",
          summary: "Old Feature",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: new Date("2026-09-20T10:00:00Z"),
          updatedAt: new Date("2026-10-05T10:00:00Z"),
          createdAt: new Date("2026-09-01T10:00:00Z"),
          assigneeJira: "bob",
          points: 10,
          priority: "Medium",
          projectKey: "PROJ",
        },
      ];

      const result = calculateLeaderboard({
        period,
        issues,
        dbUsers,
        myAliases: ["bob"],
        activeProjects: ["PROJ"],
        selectedProject: "PROJ",
      });

      // Total points: Alice 8, Bob 8.
      // Tie-breaker: Alice has 2 completed tasks, Bob has 1 completed task.
      // Alice is rank 1, Bob is rank 2.
      expect(result.members[0].jiraUsername).toBe("alice");
      expect(result.members[0].rank).toBe(1);
      expect(result.members[0].completedPoints).toBe(8);
      expect(result.members[0].completedTasks).toBe(2);
      expect(result.members[0].inProgressPoints).toBe(2);

      expect(result.members[1].jiraUsername).toBe("bob");
      expect(result.members[1].rank).toBe(2);
      expect(result.members[1].completedPoints).toBe(8);
      expect(result.members[1].completedTasks).toBe(1);
      expect(result.members[1].isCurrentUser).toBe(true);

      // Summary
      expect(result.summary.totalTeamPoints).toBe(16);
      expect(result.summary.totalTeamTasks).toBe(3);
      expect(result.summary.activeMembersCount).toBe(2);
      expect(result.summary.averagePointsPerMember).toBe(8);
      expect(result.summary.topPerformer?.jiraUsername).toBe("alice");

      // Personal performance for Bob
      expect(result.myPerformance?.rank).toBe(2);
      expect(result.myPerformance?.completedPoints).toBe(8);
      expect(result.myPerformance?.nextRankUser?.displayName).toBe("Alice Tu Tien");
      expect(result.myPerformance?.pointsToNextRank).toBe(1); // 8 - 8 + 1 = 1
    });

    it("counts task completed at 2026-09-30T18:00:00Z (01:00 Oct 1 VN) in October, not in September", () => {
      const periodOct = computePeriodBounds("month", 2026, 10);
      const periodSep = computePeriodBounds("month", 2026, 9);

      const issue: RawLeaderboardIssue = {
        jiraKey: "P-OCT1",
        summary: "Early morning Oct 1 VN task",
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-09-30T18:00:00Z"),
        updatedAt: new Date("2026-09-30T18:00:00Z"),
        createdAt: new Date("2026-09-01T10:00:00Z"),
        assigneeJira: "alice",
        points: 5,
        priority: "High",
        projectKey: "PROJ",
      };

      const resultOct = calculateLeaderboard({
        period: periodOct,
        issues: [issue],
        dbUsers,
        myAliases: ["alice"],
        activeProjects: ["PROJ"],
        selectedProject: "PROJ",
      });
      expect(resultOct.summary.totalTeamPoints).toBe(5);
      expect(resultOct.members[0].completedTasks).toBe(1);

      const resultSep = calculateLeaderboard({
        period: periodSep,
        issues: [issue],
        dbUsers,
        myAliases: ["alice"],
        activeProjects: ["PROJ"],
        selectedProject: "PROJ",
      });
      expect(resultSep.summary.totalTeamPoints).toBe(0);
      expect(resultSep.members[0].completedTasks).toBe(0);
    });

    it("filters out non-current in-progress tasks when period is in the past", () => {
      // Historical period: 2026-01
      const pastPeriod = computePeriodBounds("month", 2026, 1);
      expect(pastPeriod.isCurrentPeriod).toBe(false);

      const issues: RawLeaderboardIssue[] = [
        {
          jiraKey: "P-10",
          summary: "Current WIP task",
          status: "In Progress",
          statusCategory: "indeterminate",
          statusChangedAt: new Date("2026-10-01T10:00:00Z"),
          updatedAt: new Date("2026-10-01T10:00:00Z"),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          assigneeJira: "alice",
          points: 5,
          priority: "High",
          projectKey: "PROJ",
        },
      ];

      const result = calculateLeaderboard({
        period: pastPeriod,
        issues,
        dbUsers,
        myAliases: ["alice"],
        activeProjects: ["PROJ"],
        selectedProject: null,
      });

      const alice = result.members.find((m) => m.jiraUsername === "alice");
      expect(alice?.inProgressPoints).toBe(0);
      expect(alice?.inProgressTasks).toBe(0);
    });

    it("completely excludes quangtn_mb, hoangld, and tinhvt from rankings and team metrics", () => {
      const extendedDbUsers: LeaderboardDbUser[] = [
        ...dbUsers,
        {
          id: "u-quang",
          displayName: "Quang TN",
          jiraUsername: "quangtn_mb",
          email: "quangtn@example.com",
          role: "developer",
        },
        {
          id: "u-hoang",
          displayName: "Hoang LD",
          jiraUsername: "hoangld",
          email: "hoangld@example.com",
          role: "developer",
        },
        {
          id: "u-tinh",
          displayName: "Tinh VT",
          jiraUsername: "tinhvt",
          email: "tinhvt@example.com",
          role: "developer",
        },
        {
          id: "u-duc",
          displayName: "Duc PM",
          jiraUsername: "ducpm2",
          email: "ducpm2@example.com",
          role: "developer",
        },
        {
          id: "u-binh",
          displayName: "Binh HT",
          jiraUsername: "binhht",
          email: "binhht@example.com",
          role: "developer",
        },
        {
          id: "u-hung",
          displayName: "Hung KD",
          jiraUsername: "HungKD_CIC",
          email: "hungkd@example.com",
          role: "developer",
        },
      ];

      const issuesWithExcludedUsers: RawLeaderboardIssue[] = [
        {
          jiraKey: "P-101",
          summary: "Alice task",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: new Date("2026-10-10T10:00:00Z"),
          updatedAt: new Date("2026-10-10T10:00:00Z"),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          assigneeJira: "alice",
          points: 5,
          priority: "High",
          projectKey: "PROJ",
        },
        {
          jiraKey: "P-102",
          summary: "Quang task",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: new Date("2026-10-10T10:00:00Z"),
          updatedAt: new Date("2026-10-10T10:00:00Z"),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          assigneeJira: "quangtn_mb",
          points: 20,
          priority: "High",
          projectKey: "PROJ",
        },
        {
          jiraKey: "P-103",
          summary: "Hoang task",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: new Date("2026-10-10T10:00:00Z"),
          updatedAt: new Date("2026-10-10T10:00:00Z"),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          assigneeJira: "hoangld",
          points: 30,
          priority: "High",
          projectKey: "PROJ",
        },
        {
          jiraKey: "P-104",
          summary: "Tinh task",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: new Date("2026-10-10T10:00:00Z"),
          updatedAt: new Date("2026-10-10T10:00:00Z"),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          assigneeJira: "tinhvt_mb",
          points: 40,
          priority: "High",
          projectKey: "PROJ",
        },
        {
          jiraKey: "P-105",
          summary: "Duc task",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: new Date("2026-10-10T10:00:00Z"),
          updatedAt: new Date("2026-10-10T10:00:00Z"),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          assigneeJira: "ducpm2",
          points: 50,
          priority: "High",
          projectKey: "PROJ",
        },
        {
          jiraKey: "P-106",
          summary: "Binh task",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: new Date("2026-10-10T10:00:00Z"),
          updatedAt: new Date("2026-10-10T10:00:00Z"),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          assigneeJira: "binhht_mb",
          points: 60,
          priority: "High",
          projectKey: "PROJ",
        },
        {
          jiraKey: "P-107",
          summary: "Hung task",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: new Date("2026-10-10T10:00:00Z"),
          updatedAt: new Date("2026-10-10T10:00:00Z"),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          assigneeJira: "HungKD_CIC",
          points: 70,
          priority: "High",
          projectKey: "PROJ",
        },
      ];

      const result = calculateLeaderboard({
        period,
        issues: issuesWithExcludedUsers,
        dbUsers: extendedDbUsers,
        myAliases: ["alice"],
        activeProjects: ["PROJ"],
        selectedProject: "PROJ",
      });

      // None of the 6 excluded users appear in members
      const memberUsernames = result.members.map((m) => m.jiraUsername.toLowerCase());
      expect(memberUsernames).not.toContain("quangtn_mb");
      expect(memberUsernames).not.toContain("quangtn");
      expect(memberUsernames).not.toContain("hoangld");
      expect(memberUsernames).not.toContain("hoangld_mb");
      expect(memberUsernames).not.toContain("tinhvt");
      expect(memberUsernames).not.toContain("tinhvt_mb");
      expect(memberUsernames).not.toContain("ducpm2");
      expect(memberUsernames).not.toContain("ducpm2_mb");
      expect(memberUsernames).not.toContain("binhht");
      expect(memberUsernames).not.toContain("binhht_mb");
      expect(memberUsernames).not.toContain("hungkd_cic");
      expect(memberUsernames).not.toContain("hungkd_cic_mb");
      expect(memberUsernames).not.toContain("hungkd");

      // Total points and top performer only reflect valid members (Alice)
      expect(result.summary.totalTeamPoints).toBe(5);
      expect(result.summary.totalTeamTasks).toBe(1);
      expect(result.summary.activeMembersCount).toBe(1);
      expect(result.summary.topPerformer?.jiraUsername).toBe("alice");
      expect(result.summary.topPerformer?.points).toBe(5);

      // Top 1 is Alice, not any of the excluded users
      expect(result.members[0].jiraUsername).toBe("alice");
      expect(result.members[0].rank).toBe(1);

      // If currentUser is one of the excluded accounts, myPerformance is null
      const excludedSelfResult = calculateLeaderboard({
        period,
        issues: issuesWithExcludedUsers,
        dbUsers: extendedDbUsers,
        myAliases: ["ducpm2"],
        activeProjects: ["PROJ"],
        selectedProject: "PROJ",
      });
      expect(excludedSelfResult.myPerformance).toBeNull();
    });

    it("excludes tasks belonging to assignees who are not in dbUsers (not logged in with jira token)", () => {
      const issuesWithUnknownAssignee: RawLeaderboardIssue[] = [
        {
          jiraKey: "P-ALICE",
          summary: "Alice task",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: new Date("2026-10-10T10:00:00Z"),
          updatedAt: new Date("2026-10-10T10:00:00Z"),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          assigneeJira: "alice",
          points: 5,
          priority: "High",
          projectKey: "PROJ",
        },
        {
          jiraKey: "P-EXTERNAL",
          summary: "External dev task",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: new Date("2026-10-10T10:00:00Z"),
          updatedAt: new Date("2026-10-10T10:00:00Z"),
          createdAt: new Date("2026-10-01T10:00:00Z"),
          assigneeJira: "external_dev",
          points: 50,
          priority: "High",
          projectKey: "PROJ",
        },
      ];

      const result = calculateLeaderboard({
        period,
        issues: issuesWithUnknownAssignee,
        dbUsers, // Only alice, bob, charlie
        myAliases: ["alice"],
        activeProjects: ["PROJ"],
        selectedProject: "PROJ",
      });

      // external_dev is NOT in dbUsers, so they should NOT be in the leaderboard
      const memberUsernames = result.members.map((m) => m.jiraUsername.toLowerCase());
      expect(memberUsernames).not.toContain("external_dev");
      expect(result.members.length).toBe(3); // Alice, Bob, Charlie (dbUsers)

      // Only Alice's 5 points count towards team points
      expect(result.summary.totalTeamPoints).toBe(5);
      expect(result.summary.totalTeamTasks).toBe(1);
      expect(result.members[0].jiraUsername).toBe("alice");
      expect(result.members[0].completedPoints).toBe(5);
    });
  });
});
