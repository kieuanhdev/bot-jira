import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { queryBranches, type BranchQueryParams } from "@/lib/bitbucket/branch-query";

/**
 * List tracked branches with search, filters, pagination, summary, facets, and task context.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const project = url.searchParams.get("project") ?? undefined;
  const repo = url.searchParams.get("repo") ?? undefined;
  const link = (url.searchParams.get("link") as BranchQueryParams["link"]) ?? undefined;
  const pr = (url.searchParams.get("pr") as BranchQueryParams["pr"]) ?? undefined;
  const taskStatus = url.searchParams.get("taskStatus") ?? undefined;
  const assignee = url.searchParams.get("assignee") ?? undefined;
  const attention = (url.searchParams.get("attention") as BranchQueryParams["attention"]) ?? undefined;
  const sort = (url.searchParams.get("sort") as BranchQueryParams["sort"]) ?? undefined;
  const order = (url.searchParams.get("order") as BranchQueryParams["order"]) ?? undefined;
  const pageStr = url.searchParams.get("page");
  const pageSizeStr = url.searchParams.get("pageSize");

  const page = pageStr ? parseInt(pageStr, 10) : 1;
  const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : 25;

  const result = await queryBranches({
    q,
    project,
    repo,
    link,
    pr,
    taskStatus,
    assignee,
    attention,
    sort,
    order,
    page: isNaN(page) ? 1 : page,
    pageSize: isNaN(pageSize) ? 25 : pageSize,
  });

  return NextResponse.json(result);
}
