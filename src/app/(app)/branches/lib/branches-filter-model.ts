import {
  type BranchFilterState,
  type BranchRowItem,
  DEFAULT_FILTERS,
} from "../branch-types";

export function parseBranchFilters(
  searchParams: { get: (key: string) => string | null }
): BranchFilterState {
  return {
    view: (searchParams.get("view") as BranchFilterState["view"]) ?? DEFAULT_FILTERS.view,
    q: searchParams.get("q") ?? DEFAULT_FILTERS.q,
    project: searchParams.get("project") ?? DEFAULT_FILTERS.project,
    repo: searchParams.get("repo") ?? DEFAULT_FILTERS.repo,
    link: (searchParams.get("link") as BranchFilterState["link"]) ?? DEFAULT_FILTERS.link,
    pr: (searchParams.get("pr") as BranchFilterState["pr"]) ?? DEFAULT_FILTERS.pr,
    taskStatus: searchParams.get("taskStatus") ?? DEFAULT_FILTERS.taskStatus,
    assignee: searchParams.get("assignee") ?? DEFAULT_FILTERS.assignee,
    attention: (searchParams.get("attention") as BranchFilterState["attention"]) ?? DEFAULT_FILTERS.attention,
    sort: (searchParams.get("sort") as BranchFilterState["sort"]) ?? DEFAULT_FILTERS.sort,
    order: (searchParams.get("order") as BranchFilterState["order"]) ?? DEFAULT_FILTERS.order,
    page: searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : DEFAULT_FILTERS.page,
    pageSize: searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!, 10) : DEFAULT_FILTERS.pageSize,
  };
}

export function buildBranchFilterParams(next: BranchFilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (next.view && next.view !== DEFAULT_FILTERS.view) params.set("view", next.view);
  if (next.q) params.set("q", next.q);
  if (next.project && next.project !== "ALL") params.set("project", next.project);
  if (next.repo && next.repo !== "ALL") params.set("repo", next.repo);
  if (next.link && next.link !== "ALL") params.set("link", next.link);
  if (next.pr && next.pr !== "ALL") params.set("pr", next.pr);
  if (next.taskStatus && next.taskStatus !== "ALL") params.set("taskStatus", next.taskStatus);
  if (next.assignee && next.assignee !== "ALL") params.set("assignee", next.assignee);
  if (next.attention && next.attention !== "0") params.set("attention", next.attention);
  if (next.sort && next.sort !== DEFAULT_FILTERS.sort) params.set("sort", next.sort);
  if (next.order && next.order !== DEFAULT_FILTERS.order) params.set("order", next.order);
  if (next.page && next.page > 1) params.set("page", String(next.page));
  if (next.pageSize && next.pageSize !== DEFAULT_FILTERS.pageSize) params.set("pageSize", String(next.pageSize));

  return params;
}

export function buildTaskQueryUrl(filters: BranchFilterState): string {
  const p = new URLSearchParams();
  p.set("view", filters.view);
  if (filters.q) p.set("q", filters.q);
  if (filters.project !== "ALL") p.set("project", filters.project);
  if (filters.repo !== "ALL") p.set("repo", filters.repo);
  if (filters.pr !== "ALL") p.set("pr", filters.pr);
  if (filters.taskStatus !== "ALL") p.set("taskStatus", filters.taskStatus);
  if (filters.assignee !== "ALL") p.set("assignee", filters.assignee);
  p.set("page", String(filters.page));
  p.set("pageSize", String(filters.pageSize));
  return `/api/branches/tasks?${p.toString()}`;
}

export function buildBranchQueryUrl(filters: BranchFilterState): string {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  if (filters.project !== "ALL") p.set("project", filters.project);
  if (filters.repo !== "ALL") p.set("repo", filters.repo);
  if (filters.link !== "ALL") p.set("link", filters.link);
  if (filters.pr !== "ALL") p.set("pr", filters.pr);
  if (filters.taskStatus !== "ALL") p.set("taskStatus", filters.taskStatus);
  if (filters.assignee !== "ALL") p.set("assignee", filters.assignee);
  if (filters.attention !== "0") p.set("attention", filters.attention);
  p.set("sort", filters.sort);
  p.set("order", filters.order);
  p.set("page", String(filters.page));
  p.set("pageSize", String(filters.pageSize));
  return `/api/branches?${p.toString()}`;
}

export function toBranchRowItem(item: {
  id: string;
  repo: string;
  branch: string;
  suggestedJiraKey?: string | null;
  jiraKey?: string | null;
  prTitle?: string | null;
  prUrl?: string | null;
}): BranchRowItem {
  return {
    id: item.id,
    repo: item.repo,
    branch: item.branch,
    jiraKey: item.jiraKey ?? null,
    suggestedJiraKey: item.suggestedJiraKey ?? null,
    latestCommitSha: null,
    lastCommitAt: null,
    prId: null,
    prTitle: item.prTitle ?? null,
    prUrl: item.prUrl ?? null,
    prState: null,
    prDestinationBranch: null,
    prUpdatedAt: null,
    merged: false,
    linkSource: null,
    linkConfidence: null,
    checkedAt: new Date().toISOString(),
    task: null,
    attentionSignals: [],
  };
}
