import { describe, expect, it } from "vitest";
import {
  ALL_PROJECTS,
  getInitials,
  groupTiersByRealm,
  buildLeaderboardQueryUrl,
  filterAndSortMembers,
  filterModalTasks,
} from "./leaderboard-utils";
import type { LeaderboardMember, LeaderboardTier, LeaderboardTaskItem } from "@/lib/leaderboard/types";

describe("leaderboard-utils", () => {
  describe("getInitials", () => {
    it("returns '?' for empty string", () => {
      expect(getInitials("")).toBe("?");
    });

    it("returns first two letters capitalized for single word", () => {
      expect(getInitials("alice")).toBe("AL");
      expect(getInitials("A")).toBe("A");
    });

    it("returns first and last word initials for multi-word string", () => {
      expect(getInitials("Nguyen Van A")).toBe("NA");
      expect(getInitials("  John Doe  ")).toBe("JD");
    });
  });

  describe("groupTiersByRealm", () => {
    it("groups tiers properly by realm", () => {
      const mockTiers: LeaderboardTier[] = [
        { id: "1", name: "Tier 1", realm: "Realm A", title: "T1", minPoints: 0, realmDesc: "", iconName: "Star", badgeClass: "", layer: "1", realmSummary: "", glowClass: "" },
        { id: "2", name: "Tier 2", realm: "Realm A", title: "T2", minPoints: 10, realmDesc: "", iconName: "Star", badgeClass: "", layer: "2", realmSummary: "", glowClass: "" },
        { id: "3", name: "Tier 3", realm: "Realm B", title: "T3", minPoints: 20, realmDesc: "", iconName: "Crown", badgeClass: "", layer: "3", realmSummary: "", glowClass: "" },
      ];
      const groups = groupTiersByRealm(mockTiers);
      expect(groups).toHaveLength(2);
      expect(groups[0].realm).toBe("Realm A");
      expect(groups[0].tiers).toHaveLength(2);
      expect(groups[1].realm).toBe("Realm B");
      expect(groups[1].tiers).toHaveLength(1);
    });

    it("works with default LEADERBOARD_TIERS", () => {
      const groups = groupTiersByRealm();
      expect(groups.length).toBeGreaterThan(0);
      for (const g of groups) {
        expect(g.realm).toBeTruthy();
        expect(g.tiers.length).toBeGreaterThan(0);
      }
    });
  });

  describe("buildLeaderboardQueryUrl", () => {
    it("builds query URL for month timeframe", () => {
      const url = buildLeaderboardQueryUrl("month", 2026, 10, 4, ALL_PROJECTS);
      expect(url).toBe("/api/leaderboard?timeframe=month&year=2026&month=10");
    });

    it("builds query URL for quarter timeframe with project", () => {
      const url = buildLeaderboardQueryUrl("quarter", 2026, 10, 4, "PROJ");
      expect(url).toBe("/api/leaderboard?timeframe=quarter&year=2026&quarter=4&project=PROJ");
    });

    it("builds query URL for year timeframe", () => {
      const url = buildLeaderboardQueryUrl("year", 2026, 10, 4, ALL_PROJECTS);
      expect(url).toBe("/api/leaderboard?timeframe=year&year=2026");
    });

    it("builds query URL for all timeframe", () => {
      const url = buildLeaderboardQueryUrl("all", 2026, 10, 4, ALL_PROJECTS);
      expect(url).toBe("/api/leaderboard?timeframe=all&year=2026");
    });
  });

  describe("filterAndSortMembers", () => {
    const mockTier: LeaderboardTier = {
      id: "1",
      name: "T1",
      realm: "R1",
      title: "",
      minPoints: 0,
      realmDesc: "",
      iconName: "Star",
      badgeClass: "",
      layer: "1",
      realmSummary: "",
      glowClass: "",
    };

    const mockMembers: LeaderboardMember[] = [
      {
        jiraUsername: "alice",
        displayName: "Alice Wonderland",
        email: null,
        role: null,
        rank: 1,
        totalPoints: 50,
        completedPoints: 40,
        inProgressPoints: 10,
        completedTasks: 5,
        inProgressTasks: 1,
        sharePercentage: 50,
        tier: mockTier,
        isCurrentUser: false,
        tasks: [],
      },
      {
        jiraUsername: "bob",
        displayName: "Bob Builder",
        email: null,
        role: null,
        rank: 2,
        totalPoints: 60,
        completedPoints: 30,
        inProgressPoints: 30,
        completedTasks: 8,
        inProgressTasks: 2,
        sharePercentage: 35,
        tier: mockTier,
        isCurrentUser: false,
        tasks: [],
      },
    ];

    it("filters by displayName and jiraUsername case-insensitively", () => {
      expect(filterAndSortMembers(mockMembers, "alice", "completed")).toHaveLength(1);
      expect(filterAndSortMembers(mockMembers, "BOB", "completed")).toHaveLength(1);
      expect(filterAndSortMembers(mockMembers, "wonder", "completed")).toHaveLength(1);
      expect(filterAndSortMembers(mockMembers, "xyz", "completed")).toHaveLength(0);
    });

    it("sorts by completed points default", () => {
      const result = filterAndSortMembers(mockMembers, "", "completed");
      expect(result[0].jiraUsername).toBe("alice");
      expect(result[1].jiraUsername).toBe("bob");
    });

    it("sorts by total points", () => {
      const result = filterAndSortMembers(mockMembers, "", "total");
      expect(result[0].jiraUsername).toBe("bob");
      expect(result[1].jiraUsername).toBe("alice");
    });

    it("sorts by completed tasks", () => {
      const result = filterAndSortMembers(mockMembers, "", "tasks");
      expect(result[0].jiraUsername).toBe("bob");
      expect(result[1].jiraUsername).toBe("alice");
    });
  });

  describe("filterModalTasks", () => {
    const mockTasks: LeaderboardTaskItem[] = [
      {
        jiraKey: "EPM-101",
        summary: "Fix login button",
        status: "Done",
        statusCategory: "done",
        points: 3,
        projectKey: "EPM",
        completedAt: "2026-10-01",
      },
      {
        jiraKey: "CICM-202",
        summary: "Add dashboard metrics",
        status: "In Progress",
        statusCategory: "indeterminate",
        points: 5,
        projectKey: "CICM",
        completedAt: null,
      },
    ];

    it("returns all tasks if search is empty", () => {
      expect(filterModalTasks(mockTasks, "")).toEqual(mockTasks);
      expect(filterModalTasks(undefined, "")).toEqual([]);
    });

    it("filters by jiraKey, summary, or status", () => {
      expect(filterModalTasks(mockTasks, "epm")).toHaveLength(1);
      expect(filterModalTasks(mockTasks, "LOGIN")).toHaveLength(1);
      expect(filterModalTasks(mockTasks, "progress")).toHaveLength(1);
      expect(filterModalTasks(mockTasks, "non-existent")).toHaveLength(0);
    });
  });
});
