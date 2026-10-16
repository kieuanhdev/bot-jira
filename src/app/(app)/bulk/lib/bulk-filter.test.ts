import { describe, expect, it } from "vitest";
import type { IssueItem } from "@/hooks/use-issues";
import { DEFAULT_BULK_FILTERS, effectiveAssignees, type IssueFilters } from "@/lib/issues/issue-filters";
import { filterAndSortIssues, type FilterAndSortParams, type SortOption } from "./bulk-filter";

/** Original legacy 15-filter implementation used as characterization / oracle reference. */
function legacyFilterAndSortIssues(
  displayProjectIssues: IssueItem[],
  { filterProject, taskFilters, jiraUsername, filterOnlySelected, selected, sortOption, initialKeyIndexMap, quickFilter }: FilterAndSortParams
): IssueItem[] {
  if (!filterProject) return [];
  const query = (taskFilters.query || "").trim().toLowerCase();
  const myUsername = jiraUsername?.toLowerCase();
  const activeAssignees = effectiveAssignees(taskFilters.assigneeScope);
  const isAllAssignees = activeAssignees === "ALL";
  const assigneeList: string[] = isAllAssignees ? [] : activeAssignees;

  let list = displayProjectIssues
    .filter((issue) => {
      if (taskFilters.statuses.length === 0) return true;
      return taskFilters.statuses.includes(issue.status);
    })
    .filter((issue) => {
      if (taskFilters.labels.length === 0) return true;
      return taskFilters.labels.some((l) => issue.labels.includes(l));
    })
    .filter((issue) => {
      if (taskFilters.priorities.length === 0) return true;
      return taskFilters.priorities.includes(issue.priority);
    })
    .filter((issue) => {
      if (!taskFilters.epics || taskFilters.epics.length === 0) return true;
      const issueEpic = (issue.epic ?? "").toLowerCase();
      const hasNone = taskFilters.epics.some(
        (e) => e.toLowerCase() === "none" || e.toLowerCase() === "unassigned"
      );
      if (!issue.epic) return hasNone;
      return taskFilters.epics.some(
        (e) => e.toLowerCase() !== "none" && e.toLowerCase() !== "unassigned" && e.toLowerCase() === issueEpic
      );
    })
    .filter((issue) => {
      if (isAllAssignees) return true;
      const hasUnassigned = assigneeList.some(
        (a) => a.toLowerCase() === "unassigned" || a.toLowerCase() === "none"
      );
      const named = assigneeList.filter(
        (a) => a.toLowerCase() !== "unassigned" && a.toLowerCase() !== "none"
      );
      const issueAssignee = (issue.assigneeJira ?? "").toLowerCase();
      if (!issue.assigneeJira) return hasUnassigned;
      return named.some((token) => {
        const t = token.toLowerCase();
        if (t === "me") {
          if (!myUsername) return true;
          return issueAssignee === myUsername || issueAssignee === myUsername.replace(/_mb$/, "") || `${issueAssignee}_mb` === myUsername;
        }
        return issueAssignee === t;
      });
    })
    .filter((issue) => {
      if (!taskFilters.types || taskFilters.types.length === 0) return true;
      return Boolean(issue.type && taskFilters.types.includes(issue.type));
    })
    .filter((issue) => {
      if (!taskFilters.fixVersions || taskFilters.fixVersions.length === 0) return true;
      return Boolean(issue.fixVersionNames && taskFilters.fixVersions.some((v) => issue.fixVersionNames.includes(v)));
    })
    .filter((issue) => {
      if (!taskFilters.reporters || taskFilters.reporters.length === 0) return true;
      return Boolean(issue.reporterJira && taskFilters.reporters.includes(issue.reporterJira));
    })
    .filter((issue) => {
      if (!taskFilters.approvers || taskFilters.approvers.length === 0) return true;
      return Boolean(issue.approverJira && taskFilters.approvers.includes(issue.approverJira));
    })
    .filter((issue) => {
      if (!taskFilters.testers || taskFilters.testers.length === 0) return true;
      return Boolean(issue.testerJira && taskFilters.testers.includes(issue.testerJira));
    })
    .filter((issue) => {
      if (!taskFilters.roles || taskFilters.roles.length === 0) return true;
      if (!myUsername) return true;
      return taskFilters.roles.some((role) => {
        const r = role.toLowerCase();
        if (r === "assignee") return issue.assigneeJira?.toLowerCase() === myUsername;
        if (r === "reporter") return issue.reporterJira?.toLowerCase() === myUsername;
        if (r === "approver") return issue.approverJira?.toLowerCase() === myUsername;
        if (r === "tester") return issue.testerJira?.toLowerCase() === myUsername;
        return false;
      });
    })
    .filter((issue) => {
      if (!taskFilters.overdue) return true;
      if (!issue.dueDate) return false;
      const d = new Date(issue.dueDate);
      return !isNaN(d.getTime()) && d < new Date() && issue.statusCategory.toLowerCase() !== "done";
    })
    .filter((issue) => {
      if (!quickFilter) return true;
      const isDone = issue.statusCategory.toLowerCase() === "done";
      if (quickFilter === "overdue") {
        return Boolean(issue.dueDate && new Date(issue.dueDate) < new Date() && !isDone);
      }
      if (quickFilter === "unassigned") {
        return !issue.assigneeJira;
      }
      if (quickFilter === "unestimated") {
        return issue.originalEstimateSeconds == null && issue.points == null && !isDone;
      }
      if (quickFilter === "stale") {
        return Boolean(issue.updatedAt && (Date.now() - new Date(issue.updatedAt).getTime()) >= 7 * 86_400_000 && !isDone);
      }
      if (quickFilter === "missingApprover") {
        return !issue.approverJira && !isDone;
      }
      if (quickFilter === "missingTester") {
        return !issue.testerJira && !isDone;
      }
      return true;
    })
    .filter((issue) =>
      query ? issue.jiraKey.toLowerCase().includes(query) || issue.summary.toLowerCase().includes(query) : true
    );

  if (filterOnlySelected) {
    list = list.filter((issue) => selected.has(issue.jiraKey));
  }

  // Apply sorting
  if (sortOption === "name-asc") {
    list = [...list].sort((a, b) => (a.summary || "").localeCompare(b.summary || ""));
  } else if (sortOption === "name-desc") {
    list = [...list].sort((a, b) => (b.summary || "").localeCompare(a.summary || ""));
  } else if (sortOption === "created-desc") {
    list = [...list].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  } else if (sortOption === "created-asc") {
    list = [...list].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  } else if (sortOption === "updated-desc") {
    list = [...list].sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  } else if (initialKeyIndexMap.size > 0) {
    list = [...list].sort((a, b) => {
      const aIndex = initialKeyIndexMap.get(a.jiraKey);
      const bIndex = initialKeyIndexMap.get(b.jiraKey);
      if (aIndex !== undefined && bIndex !== undefined) {
        return aIndex - bIndex;
      }
      if (aIndex !== undefined) return -1;
      if (bIndex !== undefined) return 1;
      return 0;
    });
  }

  return list;
}

// Deterministic PRNG (Mulberry32) for reproducible property-style testing
function createRng(seed: number) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateFixture(size: number, seed = 42): IssueItem[] {
  const rng = createRng(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const statuses = [
    { name: "To Do", cat: "new" },
    { name: "In Progress", cat: "indeterminate" },
    { name: "In Review", cat: "indeterminate" },
    { name: "Done", cat: "done" },
  ];
  const allLabels = ["be", "fe", "bug", "infra", "auth", "ux"];
  const priorities = ["Low", "Medium", "High", "Highest", "Blocker"];
  const epics = ["EPM-10", "EPM-20", "EPM-30", null];
  const assignees = ["alice", "bob", "bob_mb", "charlie", null];
  const types = ["Task", "Bug", "Story"];
  const reporters = ["alice", "bob", "lead"];
  const approvers = ["alice", "bob", null];
  const testers = ["carol", "dan", null];

  const now = Date.now();
  const day = 86_400_000;

  const items: IssueItem[] = [];
  for (let i = 1; i <= size; i++) {
    const st = pick(statuses);
    const labelCount = Math.floor(rng() * 3);
    const labels: string[] = [];
    for (let l = 0; l < labelCount; l++) {
      const lbl = pick(allLabels);
      if (!labels.includes(lbl)) labels.push(lbl);
    }
    const dueOffset = (Math.floor(rng() * 20) - 10) * day;
    const dueDate = rng() > 0.3 ? new Date(now + dueOffset).toISOString().slice(0, 10) : null;
    const createdOffset = Math.floor(rng() * 30 + 1) * day;
    const updatedOffset = Math.floor(rng() * 20) * day;

    items.push({
      jiraKey: `EPM-${i}`,
      projectKey: "EPM",
      summary: `Issue summary ${i} ${pick(["login", "sync", "dashboard", "export", "webhook"])}`,
      description: "",
      status: st.name,
      statusCategory: st.cat,
      statusChangedAt: null,
      assigneeJira: pick(assignees),
      reporterJira: pick(reporters),
      approverJira: pick(approvers),
      testerJira: pick(testers),
      labels,
      fixVersionIds: [],
      fixVersionNames: rng() > 0.5 ? [pick(["v1.0", "v2.0"])] : [],
      priority: pick(priorities),
      points: rng() > 0.5 ? Math.floor(rng() * 8) + 1 : null,
      type: pick(types),
      epic: pick(epics),
      dueDate,
      timeSpent: null,
      originalEstimateSeconds: rng() > 0.5 ? 3600 * (Math.floor(rng() * 8) + 1) : null,
      createdAt: new Date(now - createdOffset).toISOString(),
      updatedAt: new Date(now - updatedOffset).toISOString(),
      lastSyncedAt: new Date().toISOString(),
      aiScore: null,
      aiDecision: null,
    });
  }

  return items;
}

describe("filterAndSortIssues property-style equivalence test", () => {
  const fixture1000 = generateFixture(1000, 1337);

  const sortOptions: SortOption[] = [
    "default",
    "name-asc",
    "name-desc",
    "created-desc",
    "created-asc",
    "updated-desc",
  ];

  const quickFilters = [
    "",
    "overdue",
    "unassigned",
    "unestimated",
    "stale",
    "missingApprover",
    "missingTester",
  ];

  it("produces identical results to the legacy multi-filter implementation across 60 randomized filter configurations", () => {
    const rng = createRng(999);
    const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

    for (let round = 0; round < 60; round++) {
      const selectedKeys = new Set<string>();
      for (let s = 1; s <= 20; s++) {
        selectedKeys.add(`EPM-${Math.floor(rng() * 1000) + 1}`);
      }

      const initialKeyIndexMap = new Map<string, number>();
      if (rng() > 0.5) {
        initialKeyIndexMap.set(`EPM-${Math.floor(rng() * 1000) + 1}`, 0);
        initialKeyIndexMap.set(`EPM-${Math.floor(rng() * 1000) + 1}`, 1);
      }

      const statuses = rng() > 0.6 ? [pick(["To Do", "In Progress", "In Review", "Done"])] : [];
      const labels = rng() > 0.6 ? [pick(["be", "fe", "bug"])] : [];
      const priorities = rng() > 0.6 ? [pick(["High", "Lowest", "Blocker"])] : [];
      const epics = rng() > 0.7 ? [pick(["EPM-10", "none"])] : [];
      const types = rng() > 0.7 ? [pick(["Bug", "Task"])] : [];
      const fixVersions = rng() > 0.7 ? [pick(["v1.0", "v2.0"])] : [];
      const reporters = rng() > 0.7 ? [pick(["alice", "bob"])] : [];
      const approvers = rng() > 0.7 ? [pick(["alice", "bob"])] : [];
      const testers = rng() > 0.7 ? [pick(["carol", "dan"])] : [];
      const roles = rng() > 0.7 ? [pick(["assignee", "reporter", "approver"])] : [];
      const overdue = rng() > 0.7;
      const quickFilter = pick(quickFilters);
      const query = rng() > 0.7 ? pick(["sync", "login", "epm-5", "epm-1"]) : "";
      const filterOnlySelected = rng() > 0.8;
      const sortOption = pick(sortOptions);

      const assigneeMode = pick(["ALL", "me", "unassigned", "bob_mb", "alice"]);
      const assigneeScope =
        assigneeMode === "ALL"
          ? { mode: "all" as const, roster: [] as string[], view: "all-selected" as const }
          : { mode: "roster" as const, roster: [assigneeMode], view: "all-selected" as const };

      const taskFilters: IssueFilters = {
        ...DEFAULT_BULK_FILTERS,
        query,
        statuses,
        labels,
        priorities,
        epics,
        assigneeScope,
        types,
        fixVersions,
        reporters,
        approvers,
        testers,
        roles,
        overdue,
      };

      const params: FilterAndSortParams = {
        filterProject: "EPM",
        taskFilters,
        jiraUsername: "alice",
        filterOnlySelected,
        selected: selectedKeys,
        sortOption,
        initialKeyIndexMap,
        quickFilter,
      };

      const legacyResult = legacyFilterAndSortIssues(fixture1000, params);
      const newResult = filterAndSortIssues(fixture1000, params);

      expect(newResult.map((i) => i.jiraKey)).toEqual(legacyResult.map((i) => i.jiraKey));
    }
  });

  it("benchmarks single-pass filter against legacy 15-pass filter for 1000 issues", () => {
    const params: FilterAndSortParams = {
      filterProject: "EPM",
      taskFilters: {
        ...DEFAULT_BULK_FILTERS,
        query: "login",
        statuses: ["To Do", "In Progress"],
        labels: ["fe"],
        priorities: ["Medium", "High"],
        overdue: false,
      },
      jiraUsername: "alice",
      filterOnlySelected: false,
      selected: new Set(["EPM-1", "EPM-2"]),
      sortOption: "name-asc",
      initialKeyIndexMap: new Map(),
      quickFilter: "unestimated",
    };

    // Warm-up
    for (let i = 0; i < 5; i++) {
      legacyFilterAndSortIssues(fixture1000, params);
      filterAndSortIssues(fixture1000, params);
    }

    const iterations = 50;
    const startLegacy = performance.now();
    for (let i = 0; i < iterations; i++) {
      legacyFilterAndSortIssues(fixture1000, params);
    }
    const legacyDuration = performance.now() - startLegacy;

    const startNew = performance.now();
    for (let i = 0; i < iterations; i++) {
      filterAndSortIssues(fixture1000, params);
    }
    const newDuration = performance.now() - startNew;

    // Log benchmark numbers
    // Legacy: ~15 passes with array allocations
    // Single-pass: 1 pass with Set lookups
    const speedup = (legacyDuration / newDuration).toFixed(2);
    // Print benchmark metrics in test output
    process.stdout.write(
      `[Benchmark 1000 issues × ${iterations} runs] Legacy: ${legacyDuration.toFixed(2)}ms, Single-pass: ${newDuration.toFixed(2)}ms (Speedup: ${speedup}x)\n`
    );

    expect(newDuration).toBeLessThanOrEqual(legacyDuration * 1.5); // Allow CI noise
  });
});
