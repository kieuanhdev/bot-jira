import { describe, expect, it } from "vitest";
import type { IssueItem } from "@/hooks/use-issues";
import {
  allowedColumnKeys,
  buildColumns,
  buildColumnViews,
  canDropTo,
  COL_BATCH,
  findTransition,
  indexColumnsByStatus,
  indexColumnsByStatusId,
  summarizeBoard,
  type BoardColumn,
  type BoardStatusesResponse,
} from "./board-columns";

const issue = (o: Partial<IssueItem>): IssueItem =>
  ({
    jiraKey: "EPM-1", status: "To Do", statusId: "1", statusCategory: "new",
    updatedAt: "2026-10-01T00:00:00Z", ...o,
  }) as IssueItem;

const statuses: BoardStatusesResponse = {
  columns: [
    { id: "c-todo", name: "To Do", statusIds: ["1"], statuses: [{ id: "1", name: "To Do" }], isBacklog: false, isDone: false },
    { id: "c-prog", name: "In Progress", statusIds: ["2"], statuses: [{ id: "2", name: "In Progress" }], isBacklog: false, isDone: false },
    { id: "c-done", name: "Done", statusIds: ["3"], statuses: [{ id: "3", name: "Done" }], isBacklog: false, isDone: true },
  ],
  statusCategoryMap: { "To Do": "new", "In Progress": "indeterminate", Done: "done" },
};
const catMap = statuses.statusCategoryMap;

describe("buildColumns", () => {
  it("maps workflow columns and derives category", () => {
    const cols = buildColumns(statuses, catMap, []);
    expect(cols.map((c) => [c.key, c.category])).toEqual([
      ["c-todo", "new"], ["c-prog", "indeterminate"], ["c-done", "done"],
    ]);
  });

  it("adds a runtime column for an issue whose status is not in the workflow", () => {
    const cols = buildColumns(statuses, catMap, [issue({ status: "Weird", statusId: "77", statusCategory: "indeterminate" })]);
    expect(cols).toHaveLength(4);
    expect(cols[3]).toMatchObject({ key: "status:77", label: "Weird", category: "indeterminate", statusIds: ["77"] });
  });

  it("does not add a column for a status already known by name", () => {
    expect(buildColumns(statuses, catMap, [issue({ status: "to do", statusId: "999" })])).toHaveLength(3);
  });

  it("falls back to a default three-column board with no data", () => {
    expect(buildColumns(undefined, {}, []).map((c) => c.key)).toEqual(["status:todo", "status:inprogress", "status:done"]);
  });
});

describe("column indexes and summary", () => {
  const cols = buildColumns(statuses, catMap, []);

  it("indexes columns by status id and by status/label name", () => {
    expect(indexColumnsByStatusId(cols).get("2")).toBe("c-prog");
    expect(indexColumnsByStatus(cols).get("Done")).toBe("c-done");
  });

  it("summarizes in-progress, done, stale (>=7 days, not done) and open", () => {
    const now = Date.now();
    const old = new Date(now - 10 * 86_400_000).toISOString();
    const recent = new Date(now - 1 * 86_400_000).toISOString();
    const byColumn = new Map<string, IssueItem[]>([
      ["c-todo", [issue({ jiraKey: "A", updatedAt: old })]],
      ["c-prog", [issue({ jiraKey: "B", updatedAt: recent }), issue({ jiraKey: "C", updatedAt: old })]],
      ["c-done", [issue({ jiraKey: "D", updatedAt: old })]],
    ]);
    const issues = [...byColumn.values()].flat();
    expect(summarizeBoard(cols, byColumn, issues)).toEqual({ inProgress: 2, done: 1, stale: 2, open: 3 });
  });
});

describe("transitions", () => {
  const cols = buildColumns(statuses, catMap, []);
  const toProgress = [{ id: "21", name: "Start", to: { name: "In Progress" } }];
  const toDone = [{ id: "31", name: "Finish", to: "Done" }];

  it("canDropTo matches by target label, column statuses, or category", () => {
    expect(canDropTo(cols, catMap, toProgress, "In Progress", "indeterminate", "c-prog")).toBe(true);
    expect(canDropTo(cols, catMap, toProgress, "Done", "done", "c-done")).toBe(false);
    // different label but same category through a runtime key
    expect(canDropTo(cols, catMap, [{ id: "9", to: "Done" }], "Closed", "done", "status:closed")).toBe(true);
  });

  it("findTransition prefers an exact status, then column statuses, then category", () => {
    expect(findTransition(cols, catMap, toProgress, "In Progress", "c-prog")?.id).toBe("21");
    expect(findTransition(cols, catMap, toDone, "Whatever", "c-done")?.id).toBe("31");
    expect(findTransition(cols, catMap, toDone, "Nope", "c-todo")).toBeNull();
  });

  it("allowedColumnKeys always includes the current column", () => {
    expect([...allowedColumnKeys(cols, catMap, "c-todo", toProgress)].sort()).toEqual(["c-prog", "c-todo"]);
    expect([...allowedColumnKeys(cols, catMap, "c-todo", [])]).toEqual(["c-todo"]);
  });
});

describe("buildColumnViews", () => {
  const cols: BoardColumn[] = buildColumns(statuses, catMap, []);
  const many = Array.from({ length: COL_BATCH + 5 }, (_, i) => issue({ jiraKey: `P-${i}` }));
  const sorted = new Map<string, IssueItem[]>([["c-todo", many], ["c-prog", []], ["c-done", []]]);

  it("limits visible cards per column and keeps the total", () => {
    const views = buildColumnViews(cols, sorted, {}, new Set(), 0);
    expect(views[0].items).toHaveLength(COL_BATCH);
    expect(views[0].total).toBe(COL_BATCH + 5);
    expect(buildColumnViews(cols, sorted, { "c-todo": COL_BATCH * 2 }, new Set(), 0)[0].items).toHaveLength(COL_BATCH + 5);
  });

  it("flags WIP overflow only for in-progress columns and honors collapsed", () => {
    const wip = new Map(sorted).set("c-prog", Array.from({ length: 9 }, (_, i) => issue({ jiraKey: `W-${i}` })));
    const views = buildColumnViews(cols, wip, {}, new Set(["c-done"]), 0);
    expect(views.map((v) => v.wipOver)).toEqual([false, true, false]);
    expect(views[2].collapsed).toBe(true);
  });

  it("uses a filter-aware empty message for the backlog column", () => {
    const backlog: BoardColumn[] = [{ ...cols[0], isBacklog: true }];
    expect(buildColumnViews(backlog, new Map(), {}, new Set(), 0)[0].emptyMessage).toBe("Không có task Backlog");
    expect(buildColumnViews(backlog, new Map(), {}, new Set(), 2)[0].emptyMessage).toBe("Không có task Backlog khớp bộ lọc");
    expect(buildColumnViews(cols, sorted, {}, new Set(), 0)[0].emptyMessage).toBeUndefined();
  });
});
