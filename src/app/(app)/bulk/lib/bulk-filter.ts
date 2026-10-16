import type { IssueItem } from "@/hooks/use-issues";
import {
  type IssueFilters,
  effectiveAssignees,
} from "@/lib/issues/issue-filters";

export type SortOption =
  | "default"
  | "name-asc"
  | "name-desc"
  | "created-desc"
  | "created-asc"
  | "updated-desc";

export interface FilterAndSortParams {
  filterProject: string;
  taskFilters: IssueFilters;
  jiraUsername: string | null | undefined;
  filterOnlySelected: boolean;
  selected: Set<string>;
  sortOption: SortOption;
  initialKeyIndexMap: Map<string, number>;
  quickFilter?: string;
}

/** Apply the task filters, "only selected" toggle and sort order to the project's issues. */
export function filterAndSortIssues(
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
    // Prioritize tasks being standardized (from initialKeys) to the top in their specified order
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
