import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import type { IssueItem } from "@/hooks/use-issues";
import { DEFAULT_BULK_FILTERS, type IssueFilters } from "@/lib/issues/issue-filters";
import type { Preview, ProjectFieldOption } from "./bulk-types";
import {
  buildBulkAction,
  buildPreviewRequestBody,
  computePreviewBasis,
  countPreviewBuckets,
  deriveApproverOptions,
  deriveAssigneeOptions,
  deriveEpicOptions,
  deriveFixVersionOptions,
  deriveLabelOptions,
  derivePriorityOptions,
  deriveProjectStatuses,
  deriveReporterOptions,
  deriveStatusOptions,
  deriveTesterOptions,
  deriveTypeOptions,
  filterAndSortIssues,
  getConfirmLabel,
  isValidEstimate,
  withPlaceholderIssues,
  type BulkActionInput,
  type BulkFiltersResponse,
} from "./bulk-logic";

const issue = (o: Partial<IssueItem>): IssueItem =>
  ({
    jiraKey: "EPM-1", projectKey: "EPM", summary: "Alpha", status: "To Do", statusCategory: "new",
    assigneeJira: "alice", labels: [], priority: "Medium", epic: null,
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-10T00:00:00Z", ...o,
  }) as IssueItem;

const emptyFilters: BulkFiltersResponse = { assignees: [], labels: [], priorities: [] };

describe("option derivation", () => {
  const issues = [
    issue({ jiraKey: "EPM-1", assigneeJira: "zed", labels: ["b", "a"], priority: "High" }),
    issue({ jiraKey: "EPM-2", assigneeJira: "amy", labels: ["a"], priority: "Low", epic: "EPM-100" }),
    issue({ jiraKey: "EPM-3", assigneeJira: null, epic: "EPM-200", status: "Done", statusCategory: "done" }),
  ];

  it("prefers server filter options and falls back to the loaded issues", () => {
    expect(deriveAssigneeOptions({ ...emptyFilters, assignees: ["x"] }, issues)).toEqual(["x"]);
    expect(deriveAssigneeOptions(undefined, issues)).toEqual(["amy", "zed"]);
    expect(deriveLabelOptions({ ...emptyFilters, labels: ["srv"] }, issues)).toEqual(["srv"]);
    expect(deriveLabelOptions(emptyFilters, issues)).toEqual(["a", "b"]);
    expect(derivePriorityOptions(undefined, issues)).toEqual(["High", "Low", "Medium"]);
    expect(derivePriorityOptions(undefined, [])).toEqual(["Blocker", "High", "Highest", "Low", "Medium"]);
  });

  it("builds epic options with a 'no epic' entry and the user's own epics marked", () => {
    const opts = deriveEpicOptions({ ...emptyFilters, epics: ["EPM-300", ""] }, issues, "AMY");
    expect(opts).toEqual([
      { value: "none", label: "Không có Epic" },
      { value: "EPM-100", label: "EPM-100 (Của tôi)" },
      { value: "EPM-200", label: "EPM-200" },
      { value: "EPM-300", label: "EPM-300" },
    ]);
    expect(deriveEpicOptions(undefined, [issue({ epic: "E-1" })], null)).toEqual([{ value: "E-1", label: "E-1" }]);
  });

  it("merges statuses from board config, filter options and issues", () => {
    const list = deriveProjectStatuses([{ name: "To Do", category: "new" }], ["QA"], issues);
    expect(list).toEqual([
      { name: "Done", category: "done" },
      { name: "QA", category: "indeterminate" },
      { name: "To Do", category: "new" },
    ]);
    expect(deriveProjectStatuses(undefined, undefined, [])).toEqual([
      { name: "To Do", category: "new" },
      { name: "In Progress", category: "indeterminate" },
      { name: "Done", category: "done" },
    ]);
    expect(deriveStatusOptions(list, undefined, issues)).toEqual(["Done", "QA", "To Do"]);
    expect(deriveStatusOptions([], ["Z", "A"], issues)).toEqual(["Z", "A"]);
    expect(deriveStatusOptions([], undefined, issues)).toEqual(["Done", "To Do"]);
  });

  it("derives types, fixVersions, reporters, approvers, testers correctly", () => {
    const issuesWithPeople = [
      issue({ jiraKey: "EPM-1", type: "Bug", fixVersionNames: ["v1.0"], reporterJira: "rep1", approverJira: "app1", testerJira: "test1" }),
      issue({ jiraKey: "EPM-2", type: "Task", fixVersionNames: ["v2.0", "v1.0"], reporterJira: "rep2", approverJira: "app2", testerJira: "test2" }),
    ];
    expect(deriveTypeOptions({ ...emptyFilters, types: ["Story"] }, issuesWithPeople)).toEqual(["Story"]);
    expect(deriveTypeOptions(undefined, issuesWithPeople)).toEqual(["Bug", "Task"]);
    expect(deriveFixVersionOptions({ ...emptyFilters, fixVersions: ["v3"] }, issuesWithPeople)).toEqual(["v3"]);
    expect(deriveFixVersionOptions(undefined, issuesWithPeople)).toEqual(["v1.0", "v2.0"]);
    expect(deriveReporterOptions({ ...emptyFilters, reporters: ["admin"] }, issuesWithPeople)).toEqual(["admin"]);
    expect(deriveReporterOptions(undefined, issuesWithPeople)).toEqual(["rep1", "rep2"]);
    expect(deriveApproverOptions({ ...emptyFilters, approvers: ["lead"] }, issuesWithPeople)).toEqual(["lead"]);
    expect(deriveApproverOptions(undefined, issuesWithPeople)).toEqual(["app1", "app2"]);
    expect(deriveTesterOptions({ ...emptyFilters, testers: ["qc"] }, issuesWithPeople)).toEqual(["qc"]);
    expect(deriveTesterOptions(undefined, issuesWithPeople)).toEqual(["test1", "test2"]);
  });
});

describe("withPlaceholderIssues", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-06T08:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  it("adds placeholders first for URL keys of this project that are not loaded", () => {
    const loaded = [issue({ jiraKey: "EPM-1" })];
    const result = withPlaceholderIssues(["EPM-1", "EPM-9", "CICM-3"], "EPM", loaded);
    expect(result.map((i) => i.jiraKey)).toEqual(["EPM-9", "EPM-1"]);
    expect(result[0]).toMatchObject({ summary: "Task EPM-9 (Đang chuẩn hóa)", status: "To Do", projectKey: "EPM" });
    expect(result[0].createdAt).toBe("2026-10-06T08:00:00.000Z");
  });

  it("returns nothing without a project", () => {
    expect(withPlaceholderIssues(["EPM-9"], "", [])).toEqual([]);
  });
});

describe("filterAndSortIssues", () => {
  const base = (o: Partial<Parameters<typeof filterAndSortIssues>[1]> = {}) => ({
    filterProject: "EPM", taskFilters: DEFAULT_BULK_FILTERS as IssueFilters, jiraUsername: "alice",
    filterOnlySelected: false, selected: new Set<string>(), sortOption: "default" as const,
    initialKeyIndexMap: new Map<string, number>(), ...o,
  });
  const issues = [
    issue({ jiraKey: "EPM-1", summary: "Bravo", labels: ["be"], priority: "High", status: "Done", epic: "EPM-100", assigneeJira: "alice", createdAt: "2026-09-03T00:00:00Z", updatedAt: "2026-09-30T00:00:00Z" }),
    issue({ jiraKey: "EPM-2", summary: "alpha", labels: ["fe"], priority: "Low", status: "To Do", epic: null, assigneeJira: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-10T00:00:00Z" }),
    issue({ jiraKey: "EPM-3", summary: "Charlie", labels: [], priority: "Medium", status: "To Do", epic: "EPM-200", assigneeJira: "bob_mb", createdAt: "2026-09-02T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z" }),
  ];
  const keys = (r: IssueItem[]) => r.map((i) => i.jiraKey);
  const withFilters = (o: Partial<IssueFilters>): IssueFilters => ({ ...DEFAULT_BULK_FILTERS, ...o });

  it("returns nothing without a project and everything for default filters", () => {
    expect(filterAndSortIssues(issues, base({ filterProject: "" }))).toEqual([]);
    expect(keys(filterAndSortIssues(issues, base()))).toEqual(["EPM-1", "EPM-2", "EPM-3"]);
  });

  it("filters by status, label, priority and free text", () => {
    expect(keys(filterAndSortIssues(issues, base({ taskFilters: withFilters({ statuses: ["To Do"] }) })))).toEqual(["EPM-2", "EPM-3"]);
    expect(keys(filterAndSortIssues(issues, base({ taskFilters: withFilters({ labels: ["fe", "x"] }) })))).toEqual(["EPM-2"]);
    expect(keys(filterAndSortIssues(issues, base({ taskFilters: withFilters({ priorities: ["High"] }) })))).toEqual(["EPM-1"]);
    expect(keys(filterAndSortIssues(issues, base({ taskFilters: withFilters({ query: " CHARL" }) })))).toEqual(["EPM-3"]);
    expect(keys(filterAndSortIssues(issues, base({ taskFilters: withFilters({ query: "epm-2" }) })))).toEqual(["EPM-2"]);
  });

  it("filters by epic including the 'none' pseudo value", () => {
    expect(keys(filterAndSortIssues(issues, base({ taskFilters: withFilters({ epics: ["none"] }) })))).toEqual(["EPM-2"]);
    expect(keys(filterAndSortIssues(issues, base({ taskFilters: withFilters({ epics: ["epm-100"] }) })))).toEqual(["EPM-1"]);
    expect(keys(filterAndSortIssues(issues, base({ taskFilters: withFilters({ epics: ["none", "EPM-200"] }) })))).toEqual(["EPM-2", "EPM-3"]);
  });

  it("filters by assignee roster, supporting 'me' (with _mb alias) and 'unassigned'", () => {
    const roster = (r: string[]) => withFilters({ assigneeScope: { mode: "roster", roster: r, view: "all-selected" } });
    expect(keys(filterAndSortIssues(issues, base({ taskFilters: roster(["me"]) })))).toEqual(["EPM-1"]);
    expect(keys(filterAndSortIssues(issues, base({ taskFilters: roster(["unassigned"]) })))).toEqual(["EPM-2"]);
    expect(keys(filterAndSortIssues(issues, base({ taskFilters: roster(["bob_mb", "unassigned"]) })))).toEqual(["EPM-2", "EPM-3"]);
    expect(keys(filterAndSortIssues(issues, base({ jiraUsername: "bob", taskFilters: roster(["me"]) })))).toEqual([]);
    expect(keys(filterAndSortIssues(issues, base({ jiraUsername: undefined, taskFilters: roster(["me"]) })))).toEqual(["EPM-1", "EPM-3"]);
  });

  it("narrows to selected keys when requested", () => {
    expect(keys(filterAndSortIssues(issues, base({ filterOnlySelected: true, selected: new Set(["EPM-3", "EPM-1"]) })))).toEqual(["EPM-1", "EPM-3"]);
  });

  it("sorts by the chosen option", () => {
    const sorted = (sortOption: Parameters<typeof filterAndSortIssues>[1]["sortOption"]) => keys(filterAndSortIssues(issues, base({ sortOption })));
    expect(sorted("name-asc")).toEqual(["EPM-2", "EPM-1", "EPM-3"]);
    expect(sorted("name-desc")).toEqual(["EPM-3", "EPM-1", "EPM-2"]);
    expect(sorted("created-desc")).toEqual(["EPM-1", "EPM-3", "EPM-2"]);
    expect(sorted("created-asc")).toEqual(["EPM-2", "EPM-3", "EPM-1"]);
    expect(sorted("updated-desc")).toEqual(["EPM-1", "EPM-3", "EPM-2"]);
  });

  it("puts URL-provided keys first in their order under the default sort", () => {
    const initialKeyIndexMap = new Map([["EPM-3", 0], ["EPM-2", 1]]);
    expect(keys(filterAndSortIssues(issues, base({ initialKeyIndexMap })))).toEqual(["EPM-3", "EPM-2", "EPM-1"]);
    // an explicit sort wins over the URL order
    expect(keys(filterAndSortIssues(issues, base({ initialKeyIndexMap, sortOption: "name-asc" })))).toEqual(["EPM-2", "EPM-1", "EPM-3"]);
  });

  it("filters by types, fixVersions, reporters, approvers, testers, and roles", () => {
    const richIssues = [
      issue({ jiraKey: "EPM-1", type: "Bug", fixVersionNames: ["v1"], reporterJira: "alice", approverJira: "bob", testerJira: "charlie" }),
      issue({ jiraKey: "EPM-2", type: "Task", fixVersionNames: ["v2"], reporterJira: "bob", approverJira: "alice", testerJira: "alice" }),
      issue({ jiraKey: "EPM-3", type: "Story", fixVersionNames: [], reporterJira: "charlie", approverJira: null, testerJira: null }),
    ];
    expect(keys(filterAndSortIssues(richIssues, base({ taskFilters: withFilters({ types: ["Bug"] }) })))).toEqual(["EPM-1"]);
    expect(keys(filterAndSortIssues(richIssues, base({ taskFilters: withFilters({ fixVersions: ["v2"] }) })))).toEqual(["EPM-2"]);
    expect(keys(filterAndSortIssues(richIssues, base({ taskFilters: withFilters({ reporters: ["bob"] }) })))).toEqual(["EPM-2"]);
    expect(keys(filterAndSortIssues(richIssues, base({ taskFilters: withFilters({ approvers: ["bob"] }) })))).toEqual(["EPM-1"]);
    expect(keys(filterAndSortIssues(richIssues, base({ taskFilters: withFilters({ testers: ["charlie"] }) })))).toEqual(["EPM-1"]);
    expect(keys(filterAndSortIssues(richIssues, base({ jiraUsername: "alice", taskFilters: withFilters({ roles: ["reporter"] }) })))).toEqual(["EPM-1"]);
    expect(keys(filterAndSortIssues(richIssues, base({ jiraUsername: "alice", taskFilters: withFilters({ roles: ["approver"] }) })))).toEqual(["EPM-2"]);
    expect(keys(filterAndSortIssues(richIssues, base({ jiraUsername: "alice", taskFilters: withFilters({ roles: ["tester"] }) })))).toEqual(["EPM-2"]);
  });

  it("filters by overdue and quickFilter presets", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);

    const faceted = [
      issue({ jiraKey: "EPM-1", dueDate: "2026-10-01", statusCategory: "indeterminate", assigneeJira: null, originalEstimateSeconds: null, points: null, approverJira: null, testerJira: null, updatedAt: "2026-10-12T00:00:00Z" }),
      issue({ jiraKey: "EPM-2", dueDate: "2026-10-20", statusCategory: "new", assigneeJira: "alice", originalEstimateSeconds: 3600, points: 3, approverJira: null, testerJira: null, updatedAt: "2026-10-12T00:00:00Z" }),
      issue({ jiraKey: "EPM-3", dueDate: "2026-10-01", statusCategory: "done", assigneeJira: null, updatedAt: "2026-09-01T00:00:00Z" }),
      issue({ jiraKey: "EPM-4", dueDate: null, statusCategory: "new", assigneeJira: null, originalEstimateSeconds: null, points: null, updatedAt: "2026-10-01T00:00:00Z", approverJira: "bob", testerJira: "carol" }),
    ];

    expect(keys(filterAndSortIssues(faceted, base({ taskFilters: withFilters({ overdue: true }) })))).toEqual(["EPM-1"]);
    expect(keys(filterAndSortIssues(faceted, base({ quickFilter: "overdue" })))).toEqual(["EPM-1"]);
    expect(keys(filterAndSortIssues(faceted, base({ quickFilter: "unassigned" })))).toEqual(["EPM-1", "EPM-3", "EPM-4"]);
    expect(keys(filterAndSortIssues(faceted, base({ quickFilter: "unestimated" })))).toEqual(["EPM-1", "EPM-4"]);
    expect(keys(filterAndSortIssues(faceted, base({ quickFilter: "stale" })))).toEqual(["EPM-4"]);
    expect(keys(filterAndSortIssues(faceted, base({ quickFilter: "missingApprover" })))).toEqual(["EPM-1", "EPM-2"]);
    expect(keys(filterAndSortIssues(faceted, base({ quickFilter: "missingTester" })))).toEqual(["EPM-1", "EPM-2"]);

    vi.useRealTimers();
  });

  it("does not mutate the input", () => {
    const copy = [...issues];
    filterAndSortIssues(issues, base({ sortOption: "name-desc" }));
    expect(issues).toEqual(copy);
  });
});

describe("isValidEstimate", () => {
  it("accepts empty and Jira duration syntax only", () => {
    for (const ok of ["", "  ", "2h", "1d 4h", "30m", "1w2d"]) expect(isValidEstimate(ok), ok).toBe(true);
    for (const bad of ["abc", "2", "h", "1x", "2h foo"]) expect(isValidEstimate(bad), bad).toBe(false);
  });
});

describe("buildBulkAction", () => {
  const fieldMap = new Map<string, ProjectFieldOption>();
  const noPeople = {
    reporter: { value: "", clear: false },
    approver: { value: "", clear: false },
    tester: { value: "", clear: false },
  };
  const input = (o: Partial<BulkActionInput> = {}): BulkActionInput => ({
    filterProject: "EPM", operationKind: "update-fields", targetStatus: "", worklogDuration: "", isWorklogDurationValid: false,
    worklogStarted: "", worklogComment: "", enabledFields: new Set(), clearAssignee: false, assignee: "", clearLabels: false,
    label: "", priority: "", issueType: "", clearPoints: false, points: "", availableFieldMap: fieldMap, estimate: "",
    isEstimateValid: true, clearDueDate: false, dueDate: "", clearFixVersions: false, fixVersions: [], clearEpic: false,
    epic: "", people: noPeople, ...o,
  });

  it("needs a project", () => {
    expect(buildBulkAction(input({ filterProject: "" }))).toBeNull();
  });

  it("builds a transition action only with a target status", () => {
    expect(buildBulkAction(input({ operationKind: "transition" }))).toBeNull();
    expect(buildBulkAction(input({ operationKind: "transition", targetStatus: " Done " }))).toEqual({ kind: "transition", value: "Done" });
  });

  it("builds reporter/approver/tester values, or null to clear", () => {
    const people = { ...noPeople, reporter: { value: " alice ", clear: false }, tester: { value: "", clear: true } };
    expect(buildBulkAction(input({ enabledFields: new Set(["reporter", "tester"]), people })))
      .toEqual({ kind: "update-fields", value: { reporter: "alice", tester: null } });
    expect(buildBulkAction(input({ enabledFields: new Set(["approver"]) }))).toBeNull();
  });

  it("builds a log-work action with optional started/comment", () => {
    expect(buildBulkAction(input({ operationKind: "log-work", worklogDuration: "2h" }))).toBeNull();
    expect(buildBulkAction(input({ operationKind: "log-work", worklogDuration: "2h", isWorklogDurationValid: true }))).toEqual({ kind: "log-work", value: { timeSpent: "2h" } });
    expect(buildBulkAction(input({ operationKind: "log-work", worklogDuration: " 2h ", isWorklogDurationValid: true, worklogStarted: "2026-10-06T09:00", worklogComment: " hi " })))
      .toEqual({ kind: "log-work", value: { timeSpent: "2h", started: "2026-10-06T09:00", comment: "hi" } });
  });

  it("returns null when no field is enabled or a required value is missing", () => {
    expect(buildBulkAction(input())).toBeNull();
    expect(buildBulkAction(input({ enabledFields: new Set(["assignee"]) }))).toBeNull();
    expect(buildBulkAction(input({ enabledFields: new Set(["priority"]) }))).toBeNull();
    expect(buildBulkAction(input({ enabledFields: new Set(["issueType"]) }))).toBeNull();
    expect(buildBulkAction(input({ enabledFields: new Set(["points"]) }))).toBeNull();
    expect(buildBulkAction(input({ enabledFields: new Set(["dueDate"]) }))).toBeNull();
    expect(buildBulkAction(input({ enabledFields: new Set(["epic"]) }))).toBeNull();
    expect(buildBulkAction(input({ enabledFields: new Set(["estimate"]), estimate: "bad", isEstimateValid: false }))).toBeNull();
  });

  it("builds update-fields values, including clears", () => {
    const action = buildBulkAction(input({
      enabledFields: new Set(["assignee", "labels", "priority", "issueType", "points", "estimate", "dueDate", "fixVersions", "epic"]),
      assignee: " bob ", label: "a, b ,, c", priority: "High", issueType: "Bug", points: "5", estimate: " 2h ", dueDate: "2026-10-20",
      fixVersions: ["1.0"], epic: " epm-1 ",
    }));
    expect(action).toEqual({ kind: "update-fields", value: {
      assignee: "bob", labels: ["a", "b", "c"], priority: "High", issueType: "Bug", points: 5, estimate: "2h",
      dueDate: "2026-10-20", fixVersions: ["1.0"], epic: "EPM-1",
    } });

    const cleared = buildBulkAction(input({
      enabledFields: new Set(["assignee", "labels", "points", "dueDate", "fixVersions", "epic"]),
      clearAssignee: true, clearLabels: true, clearPoints: true, clearDueDate: true, clearFixVersions: true, clearEpic: true,
    }));
    expect(cleared).toEqual({ kind: "update-fields", value: { assignee: null, labels: [], points: null, dueDate: null, fixVersions: [], epic: null } });
  });

  it("skips the estimate when the project does not expose it", () => {
    const unavailable = new Map<string, ProjectFieldOption>([["estimate", { id: "estimate", jiraFieldId: "x", name: "E", available: false }]]);
    expect(buildBulkAction(input({ enabledFields: new Set(["estimate"]), estimate: "", availableFieldMap: unavailable }))).toBeNull();
    expect(buildBulkAction(input({ enabledFields: new Set(["estimate", "priority"]), estimate: "", priority: "High", availableFieldMap: unavailable })))
      .toEqual({ kind: "update-fields", value: { priority: "High" } });
  });
});

describe("buildPreviewRequestBody", () => {
  const action = { kind: "transition", value: "Done" } as const;

  it("selects by explicit keys in pick mode", () => {
    expect(buildPreviewRequestBody({ selectionMode: "pick", filterProject: "EPM", taskFilters: DEFAULT_BULK_FILTERS, selected: new Set(["EPM-2", "EPM-1"]), action }))
      .toEqual({ selector: { mode: "keys", keys: ["EPM-2", "EPM-1"] }, action });
  });

  it("sends only the active filters in filter mode", () => {
    const body = buildPreviewRequestBody({
      selectionMode: "filter", filterProject: "EPM", selected: new Set(), action,
      taskFilters: { ...DEFAULT_BULK_FILTERS, query: "login", statuses: ["To Do"], epics: ["none"], assigneeScope: { mode: "roster", roster: ["me"], view: "all-selected" } },
    });
    expect(body).toEqual({ selector: { mode: "filter", project: "EPM", filters: {
      q: "login", assignees: ["me"], statuses: ["To Do"], labels: undefined, priorities: undefined, epics: ["none"],
    } }, action });
    const all = buildPreviewRequestBody({ selectionMode: "filter", filterProject: "EPM", taskFilters: DEFAULT_BULK_FILTERS, selected: new Set(), action });
    expect(all).toMatchObject({ selector: { filters: { q: undefined, assignees: "ALL", epics: undefined } } });
  });

  it("sends new filter facets and quickFilter in filter mode", () => {
    const advanced = buildPreviewRequestBody({
      selectionMode: "filter",
      filterProject: "EPM",
      selected: new Set(),
      action,
      quickFilter: "overdue",
      taskFilters: {
        ...DEFAULT_BULK_FILTERS,
        types: ["Bug"],
        fixVersions: ["v1"],
        reporters: ["r1"],
        approvers: ["a1"],
        testers: ["t1"],
        roles: ["reporter"],
      },
    });
    expect(advanced).toEqual({
      selector: {
        mode: "filter",
        project: "EPM",
        filters: {
          assignees: "ALL",
          types: ["Bug"],
          fixVersions: ["v1"],
          reporters: ["r1"],
          approvers: ["a1"],
          testers: ["t1"],
          roles: ["reporter"],
          quickFilter: "overdue",
        },
      },
      action,
    });
  });

  it("includes quickFilter in preview basis when in filter mode", () => {
    const basis1 = computePreviewBasis({ action, selectionMode: "filter", filterProject: "EPM", taskFilters: DEFAULT_BULK_FILTERS, selected: new Set(), quickFilter: "overdue" });
    const basis2 = computePreviewBasis({ action, selectionMode: "filter", filterProject: "EPM", taskFilters: DEFAULT_BULK_FILTERS, selected: new Set(), quickFilter: "stale" });
    expect(basis1).not.toEqual(basis2);
  });
});

describe("preview summaries", () => {
  const item = (o: Record<string, unknown>) => ({ jiraKey: "K", before: {}, after: {}, warning: null, skipReason: null, transitionName: null, branchName: null, targetField: null, targetVersionId: null, exists: true, ...o });
  const preview = (type: string, items: unknown[], actionable = 3): Preview => ({ operationId: "o", type, total: items.length, actionable, skipped: 0, items: items as Preview["items"] });

  it("counts items per bucket", () => {
    const p = preview("update-fields", [
      item({ after: { a: 1 } }), item({ skipReason: "no_change" }), item({ warning: "stale_data" }), item({ skipReason: "no_transition" }),
    ]);
    expect(countPreviewBuckets(p)).toEqual({ changes: 1, unchanged: 1, warnings: 1, blocked: 1 });
    expect(countPreviewBuckets(null)).toEqual({ changes: 0, unchanged: 0, warnings: 0, blocked: 0 });
  });

  it("derives the confirm label from the operation", () => {
    const base = { isLogWorkOp: false, isTransitionOp: false, targetStatus: "" };
    expect(getConfirmLabel({ ...base, preview: null })).toBe("Xác nhận thay đổi");
    expect(getConfirmLabel({ ...base, preview: preview("update-fields", []) })).toBe("Cập nhật 3 task");
    expect(getConfirmLabel({ ...base, isLogWorkOp: true, preview: preview("log-work", []) })).toBe("Ghi worklog 3 task");
    expect(getConfirmLabel({ ...base, isTransitionOp: true, targetStatus: "Done", preview: preview("transition", []) })).toBe('Chuyển trạng thái 3 task sang "Done"');
    expect(getConfirmLabel({ ...base, isTransitionOp: true, preview: preview("transition", [item({ after: { status: "Closed" } })]) })).toBe('Chuyển trạng thái 3 task sang "Closed"');
  });
});
