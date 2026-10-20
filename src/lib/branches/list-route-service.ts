import { prisma } from "@/lib/prisma";
import { getUserScopedProjects } from "@/lib/project-scope";
import { queryBranches } from "@/lib/bitbucket/branch-query";
import { queryDeliveryTasks } from "@/lib/bitbucket/task-delivery-query";
import { userJiraUsername, jiraUsernameAliases } from "@/lib/user-creds";
import { env } from "@/lib/env";

export interface ListBranchesOptions {
  q?: string;
  project?: string;
  repo?: string;
  link?: "ALL" | "linked" | "suggested" | "unlinked";
  pr?: "ALL" | "none" | "open" | "merged" | "declined" | "closed";
  taskStatus?: string;
  assignee?: string;
  attention?: "0" | "1";
  sort?: "attention" | "updated" | "branch" | "repo" | "task";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  facetsOnly?: boolean;
}

export async function listBranchesForUser(
  sessionUser: { id: string; role?: string },
  options: ListBranchesOptions = {}
) {
  const projectScope = await getUserScopedProjects(sessionUser.id, sessionUser.role);

  const cleanProject = options.project && options.project !== "ALL" ? options.project : undefined;
  const cleanRepo = options.repo && options.repo !== "ALL" ? options.repo : undefined;
  const cleanLink = options.link && options.link !== "ALL" ? options.link : undefined;
  const cleanPr = options.pr && options.pr !== "ALL" ? options.pr : undefined;
  const cleanTaskStatus = options.taskStatus && options.taskStatus !== "ALL" ? options.taskStatus : undefined;
  const cleanAssignee = options.assignee && options.assignee !== "ALL" ? options.assignee : undefined;
  const cleanAttention = options.attention && options.attention !== "0" ? options.attention : undefined;

  const page = options.page ? Number(options.page) : 1;
  const pageSize = options.pageSize ? Number(options.pageSize) : 25;

  const result = await queryBranches({
    projectScope,
    q: options.q || undefined,
    project: cleanProject,
    repo: cleanRepo,
    link: cleanLink,
    pr: cleanPr,
    taskStatus: cleanTaskStatus,
    assignee: cleanAssignee,
    attention: cleanAttention,
    sort: options.sort,
    order: options.order,
    page: isNaN(page) ? 1 : Math.max(1, page),
    pageSize: isNaN(pageSize) ? 25 : Math.max(1, pageSize),
    facetsOnly: options.facetsOnly,
  });

  return JSON.parse(
    JSON.stringify({
      ...result,
      bitbucketBaseUrl: env.bitbucketBaseUrl || null,
      jiraBaseUrl: env.jiraBaseUrl || null,
    })
  );
}

export interface ListDeliveryTasksOptions {
  view?: "my-work" | "needs-attention" | "pending-review" | "unlinked";
  q?: string;
  project?: string;
  repo?: string;
  pr?: string;
  taskStatus?: string;
  assignee?: string;
  page?: number;
  pageSize?: number;
}

export async function listDeliveryTasksForUser(
  sessionUser: { id: string },
  options: ListDeliveryTasksOptions = {}
) {
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { jiraUsername: true, jiraUserEnc: true },
  });

  const username = userJiraUsername(user);
  const userAliases = username ? jiraUsernameAliases(username) : [];

  const cleanProject = options.project && options.project !== "ALL" ? options.project : undefined;
  const cleanRepo = options.repo && options.repo !== "ALL" ? options.repo : undefined;
  const cleanPr = options.pr && options.pr !== "ALL" ? options.pr : undefined;
  const cleanTaskStatus = options.taskStatus && options.taskStatus !== "ALL" ? options.taskStatus : undefined;
  const cleanAssignee = options.assignee && options.assignee !== "ALL" ? options.assignee : undefined;

  const page = options.page ? Number(options.page) : 1;
  const pageSize = options.pageSize ? Number(options.pageSize) : 20;

  const validView =
    options.view === "needs-attention" ||
    options.view === "pending-review" ||
    options.view === "unlinked"
      ? options.view
      : "my-work";

  const result = await queryDeliveryTasks({
    view: validView,
    q: options.q || undefined,
    project: cleanProject,
    repo: cleanRepo,
    pr: cleanPr,
    taskStatus: cleanTaskStatus,
    assignee: cleanAssignee,
    userAliases,
    page: isNaN(page) ? 1 : Math.max(1, page),
    pageSize: isNaN(pageSize) ? 20 : Math.max(1, pageSize),
  });

  return JSON.parse(
    JSON.stringify({
      ...result,
      bitbucketBaseUrl: env.bitbucketBaseUrl || null,
      jiraBaseUrl: env.jiraBaseUrl || null,
    })
  );
}
