import { describe, expect, it } from "vitest";
import { QueryClient, partialMatchKey } from "@tanstack/react-query";
import {
  adminKeys,
  boardKeys,
  branchesForKeys,
  branchesKeys,
  bulkKeys,
  chatKeys,
  freshnessKeys,
  issuesKeys,
  issuesTouchingProjects,
  leaderboardKeys,
  meKeys,
  notificationsKeys,
  notifyKeys,
  projectsKeys,
  releasesKeys,
  reportsKeys,
  settingsKeys,
  staleKeys,
  syncKeys,
  transitionsKeys,
  watchKeys,
} from "./query-keys";

describe("query-keys factory", () => {
  it("produces stable query keys matching historical shapes", () => {
    expect(issuesKeys.all).toEqual(["issues"]);
    expect(issuesKeys.detail("EPM-1")).toEqual(["issues", "EPM-1"]);
    expect(issuesKeys.search("test")).toEqual(["issues", "search", "test"]);
    expect(issuesKeys.releaseAdd("EPM", "v1", "test", "alice")).toEqual([
      "issues",
      "release-add",
      "EPM",
      "v1",
      "test",
      "alice",
    ]);
    expect(issuesKeys.versionsByProject("EPM")).toEqual(["issue-versions", "EPM"]);

    expect(boardKeys.projects).toEqual(["projects"]);
    expect(projectsKeys.all).toEqual(["projects"]);
    expect(projectsKeys.list).toEqual(["projects"]);
    expect(projectsKeys.peopleFields("EPM")).toEqual(["projects", "EPM", "people-fields"]);
    expect(projectsKeys.members("EPM")).toEqual(["projects", "EPM", "members"]);
    expect(boardKeys.statuses("EPM")).toEqual(["board", "statuses", "EPM", "auto"]);
    expect(boardKeys.statusesPrefix("EPM")).toEqual(["board", "statuses", "EPM"]);

    expect(meKeys.status).toEqual(["me", "status"]);
    expect(meKeys.prefs).toEqual(["me", "prefs"]);
    expect(meKeys.integrations).toEqual(["me-integrations"]);

    expect(branchesKeys.all).toEqual(["branches"]);
    expect(branchesKeys.tasksAll).toEqual(["branches-tasks"]);
    expect(branchesKeys.picker("EPM-1", "feature")).toEqual(["branches-tasks", "picker", "EPM-1", "feature"]);
    expect(branchesKeys.prPlan("EPM-1")).toEqual(["branches-tasks", "pr-plan", "EPM-1"]);

    expect(bulkKeys.operations).toEqual(["bulk-operations"]);
    expect(bulkKeys.operation("op-1")).toEqual(["bulk-operation", "op-1"]);
    expect(bulkKeys.op("op-1")).toEqual(["bulk-operation", "op-1"]);
    expect(bulkKeys.createMetadata("EPM")).toEqual(["bulk-create-metadata", "EPM"]);

    expect(adminKeys.sentry).toEqual(["admin", "sentry"]);
    expect(adminKeys.sentryList("review")).toEqual(["admin", "sentry", "review"]);
    expect(adminKeys.overviewErrors("sentry")).toEqual(["admin", "overview", "errors", "sentry"]);

    expect(chatKeys.identity).toEqual(["chat", "identity"]);
    expect(watchKeys.all).toEqual(["watch"]);
    expect(staleKeys.all).toEqual(["stale"]);
    expect(freshnessKeys.all).toEqual(["freshness"]);
    expect(syncKeys.active).toEqual(["sync", "active"]);
    expect(settingsKeys.users).toEqual(["settings", "users"]);
    expect(notifyKeys.preferences).toEqual(["notify", "preferences"]);
    expect(transitionsKeys.forIssue("EPM-1")).toEqual(["transitions", "EPM-1"]);
    expect(branchesForKeys.forIssue("EPM-1")).toEqual(["branches-for", "EPM-1"]);
    expect(releasesKeys.all).toEqual(["releases"]);
    expect(leaderboardKeys.all).toEqual(["leaderboard"]);
    expect(notificationsKeys.all).toEqual(["notifications"]);
    expect(notificationsKeys.unreadCount).toEqual(["notifications", "unread-count"]);
    expect(reportsKeys.all).toEqual(["reports"]);
    expect(reportsKeys.project("EPM")).toEqual(["reports", "project", "EPM", {}]);
  });


  it("verifies prefix cascades using partialMatchKey and QueryClient", () => {
    // boardKeys.projects cascade to peopleFields and members
    expect(partialMatchKey(projectsKeys.peopleFields("EPM"), boardKeys.projects)).toBe(true);
    expect(partialMatchKey(projectsKeys.members("EPM"), boardKeys.projects)).toBe(true);

    // board status prefix matches statuses with and without boardId
    expect(partialMatchKey(boardKeys.statuses("EPM", 101), boardKeys.statusesPrefix("EPM"))).toBe(true);
    expect(partialMatchKey(boardKeys.statuses("OTHER", 101), boardKeys.statusesPrefix("EPM"))).toBe(false);

    // branches tasks prefix matches picker and prPlan
    expect(partialMatchKey(branchesKeys.picker("EPM-1", "fix"), branchesKeys.tasksAll)).toBe(true);
    expect(partialMatchKey(branchesKeys.prPlan("EPM-1"), branchesKeys.tasksAll)).toBe(true);

    // admin sentry prefix matches sentryList
    expect(partialMatchKey(adminKeys.sentryList("review"), adminKeys.sentry)).toBe(true);
    expect(partialMatchKey(adminKeys.sentryList("rejected"), adminKeys.sentry)).toBe(true);

    // Integration test with QueryClient
    const qc = new QueryClient();
    qc.setQueryData(projectsKeys.peopleFields("EPM"), { ok: true });
    qc.setQueryData(projectsKeys.members("EPM"), { ok: true });
    qc.setQueryData(["other", "key"], { ok: true });
    expect(qc.getQueryCache().findAll({ queryKey: boardKeys.projects }).length).toBe(2);
  });


  it("issuesTouchingProjects predicate correctly filters scoped project lists", () => {
    const predicate = issuesTouchingProjects(["EPM", "CICM"]);

    // Non-issues query: does not match
    expect(predicate({ queryKey: ["other", "key"] })).toBe(false);

    // Detail/dependency queries: always refreshed
    expect(predicate({ queryKey: issuesKeys.detail("EPM-1") })).toBe(true);
    expect(predicate({ queryKey: issuesKeys.dependencies("XYZ-99") })).toBe(true);

    // Scoped list queries
    expect(predicate({ queryKey: ["issues", "project=EPM&status=open"] })).toBe(true);
    expect(predicate({ queryKey: ["issues", "project=OTHER&status=open"] })).toBe(false);
    expect(predicate({ queryKey: ["issues", "projectList=ABC,CICM"] })).toBe(true);
    // Unscoped ("all"): refreshed
    expect(predicate({ queryKey: ["issues", "all"] })).toBe(true);
  });
});
