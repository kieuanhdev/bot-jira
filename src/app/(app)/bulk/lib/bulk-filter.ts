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

/** Apply the task filters, "only selected" toggle and sort order to the project's issues in a single combined pass. */
export function filterAndSortIssues(
  displayProjectIssues: IssueItem[],
  {
    filterProject,
    taskFilters,
    jiraUsername,
    filterOnlySelected,
    selected,
    sortOption,
    initialKeyIndexMap,
    quickFilter,
  }: FilterAndSortParams
): IssueItem[] {
  if (!filterProject) return [];

  const now = new Date();
  const nowMs = now.getTime();
  const staleThreshold = 7 * 86_400_000;

  const query = (taskFilters.query || "").trim().toLowerCase();
  const myUsername = jiraUsername?.toLowerCase();
  const myUsernameStripMb = myUsername ? myUsername.replace(/_mb$/, "") : "";

  // 1. Statuses set
  const hasStatusFilter = taskFilters.statuses.length > 0;
  const statusSet = hasStatusFilter ? new Set(taskFilters.statuses) : null;

  // 2. Labels set
  const hasLabelFilter = taskFilters.labels.length > 0;
  const labelSet = hasLabelFilter ? new Set(taskFilters.labels) : null;

  // 3. Priorities set
  const hasPriorityFilter = taskFilters.priorities.length > 0;
  const prioritySet = hasPriorityFilter ? new Set(taskFilters.priorities) : null;

  // 4. Epics lookup
  const hasEpicFilter = Boolean(taskFilters.epics && taskFilters.epics.length > 0);
  let epicHasNone = false;
  let epicNamedSet: Set<string> | null = null;
  if (hasEpicFilter && taskFilters.epics) {
    for (const e of taskFilters.epics) {
      const lower = e.toLowerCase();
      if (lower === "none" || lower === "unassigned") {
        epicHasNone = true;
      } else {
        if (!epicNamedSet) epicNamedSet = new Set();
        epicNamedSet.add(lower);
      }
    }
  }

  // 5. Assignee roster
  const activeAssignees = effectiveAssignees(taskFilters.assigneeScope);
  const isAllAssignees = activeAssignees === "ALL";
  let hasUnassigned = false;
  let hasMe = false;
  let namedAssigneeSet: Set<string> | null = null;
  if (!isAllAssignees) {
    const assigneeList: string[] = activeAssignees;
    for (const a of assigneeList) {
      const t = a.toLowerCase();
      if (t === "unassigned" || t === "none") {
        hasUnassigned = true;
      } else if (t === "me") {
        hasMe = true;
      } else {
        if (!namedAssigneeSet) namedAssigneeSet = new Set();
        namedAssigneeSet.add(t);
      }
    }
  }

  // 6. Types set
  const hasTypes = Boolean(taskFilters.types && taskFilters.types.length > 0);
  const typeSet = hasTypes && taskFilters.types ? new Set(taskFilters.types) : null;

  // 7. FixVersions set
  const hasFixVersions = Boolean(taskFilters.fixVersions && taskFilters.fixVersions.length > 0);
  const fixVersionSet = hasFixVersions && taskFilters.fixVersions ? new Set(taskFilters.fixVersions) : null;

  // 8. Reporters set
  const hasReporters = Boolean(taskFilters.reporters && taskFilters.reporters.length > 0);
  const reporterSet = hasReporters && taskFilters.reporters ? new Set(taskFilters.reporters) : null;

  // 9. Approvers set
  const hasApprovers = Boolean(taskFilters.approvers && taskFilters.approvers.length > 0);
  const approverSet = hasApprovers && taskFilters.approvers ? new Set(taskFilters.approvers) : null;

  // 10. Testers set
  const hasTesters = Boolean(taskFilters.testers && taskFilters.testers.length > 0);
  const testerSet = hasTesters && taskFilters.testers ? new Set(taskFilters.testers) : null;

  // 11. Roles check
  const hasRoles = Boolean(taskFilters.roles && taskFilters.roles.length > 0);
  let checkRoles = false;
  let roleAssignee = false;
  let roleReporter = false;
  let roleApprover = false;
  let roleTester = false;
  if (hasRoles && myUsername && taskFilters.roles) {
    checkRoles = true;
    for (const role of taskFilters.roles) {
      const r = role.toLowerCase();
      if (r === "assignee") roleAssignee = true;
      else if (r === "reporter") roleReporter = true;
      else if (r === "approver") roleApprover = true;
      else if (r === "tester") roleTester = true;
    }
  }

  // Single combined filtering predicate pass
  const list = displayProjectIssues.filter((issue) => {
    // Status
    if (hasStatusFilter && !statusSet!.has(issue.status)) {
      return false;
    }

    // Label
    if (hasLabelFilter && !issue.labels.some((l) => labelSet!.has(l))) {
      return false;
    }

    // Priority
    if (hasPriorityFilter && !prioritySet!.has(issue.priority)) {
      return false;
    }

    // Epic
    if (hasEpicFilter) {
      if (!issue.epic) {
        if (!epicHasNone) return false;
      } else {
        if (!epicNamedSet || !epicNamedSet.has(issue.epic.toLowerCase())) {
          return false;
        }
      }
    }

    // Assignee
    if (!isAllAssignees) {
      if (!issue.assigneeJira) {
        if (!hasUnassigned) return false;
      } else {
        const issueAssignee = issue.assigneeJira.toLowerCase();
        let matched = Boolean(namedAssigneeSet && namedAssigneeSet.has(issueAssignee));
        if (!matched && hasMe) {
          if (!myUsername) {
            matched = true;
          } else if (
            issueAssignee === myUsername ||
            issueAssignee === myUsernameStripMb ||
            `${issueAssignee}_mb` === myUsername
          ) {
            matched = true;
          }
        }
        if (!matched) return false;
      }
    }

    // Type
    if (hasTypes && (!issue.type || !typeSet!.has(issue.type))) {
      return false;
    }

    // Fix versions
    if (hasFixVersions && (!issue.fixVersionNames || !issue.fixVersionNames.some((v) => fixVersionSet!.has(v)))) {
      return false;
    }

    // Reporter
    if (hasReporters && (!issue.reporterJira || !reporterSet!.has(issue.reporterJira))) {
      return false;
    }

    // Approver
    if (hasApprovers && (!issue.approverJira || !approverSet!.has(issue.approverJira))) {
      return false;
    }

    // Tester
    if (hasTesters && (!issue.testerJira || !testerSet!.has(issue.testerJira))) {
      return false;
    }

    // Roles
    if (checkRoles) {
      const matchesRole =
        (roleAssignee && issue.assigneeJira?.toLowerCase() === myUsername) ||
        (roleReporter && issue.reporterJira?.toLowerCase() === myUsername) ||
        (roleApprover && issue.approverJira?.toLowerCase() === myUsername) ||
        (roleTester && issue.testerJira?.toLowerCase() === myUsername);
      if (!matchesRole) return false;
    }

    // Overdue
    if (taskFilters.overdue) {
      if (!issue.dueDate) return false;
      const d = new Date(issue.dueDate);
      if (isNaN(d.getTime()) || d >= now || issue.statusCategory.toLowerCase() === "done") {
        return false;
      }
    }

    // Quick filter
    if (quickFilter) {
      const isDone = issue.statusCategory.toLowerCase() === "done";
      if (quickFilter === "overdue") {
        if (!issue.dueDate || new Date(issue.dueDate) >= now || isDone) return false;
      } else if (quickFilter === "unassigned") {
        if (issue.assigneeJira) return false;
      } else if (quickFilter === "unestimated") {
        if (issue.originalEstimateSeconds != null || issue.points != null || isDone) return false;
      } else if (quickFilter === "stale") {
        if (!issue.updatedAt || nowMs - new Date(issue.updatedAt).getTime() < staleThreshold || isDone) {
          return false;
        }
      } else if (quickFilter === "missingApprover") {
        if (issue.approverJira || isDone) return false;
      } else if (quickFilter === "missingTester") {
        if (issue.testerJira || isDone) return false;
      }
    }

    // Text search query
    if (query) {
      const keyMatches = issue.jiraKey.toLowerCase().includes(query);
      const summaryMatches = issue.summary.toLowerCase().includes(query);
      if (!keyMatches && !summaryMatches) return false;
    }

    // Filter only selected
    if (filterOnlySelected && !selected.has(issue.jiraKey)) {
      return false;
    }

    return true;
  });

  // Apply sorting in place on the freshly filtered list
  if (sortOption === "name-asc") {
    list.sort((a, b) => (a.summary || "").localeCompare(b.summary || ""));
  } else if (sortOption === "name-desc") {
    list.sort((a, b) => (b.summary || "").localeCompare(a.summary || ""));
  } else if (sortOption === "created-desc") {
    list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  } else if (sortOption === "created-asc") {
    list.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  } else if (sortOption === "updated-desc") {
    list.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  } else if (initialKeyIndexMap.size > 0) {
    list.sort((a, b) => {
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
