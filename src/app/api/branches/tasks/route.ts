import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraUsername, jiraUsernameAliases } from "@/lib/user-creds";
import { queryDeliveryTasks, type TaskDeliveryQueryParams } from "@/lib/bitbucket/task-delivery-query";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUsername: true, jiraUserEnc: true },
  });

  const username = userJiraUsername(user);
  const userAliases = username ? jiraUsernameAliases(username) : [];

  const url = new URL(req.url);
  const view = (url.searchParams.get("view") as TaskDeliveryQueryParams["view"]) ?? "my-work";
  const q = url.searchParams.get("q") ?? undefined;
  const project = url.searchParams.get("project") ?? undefined;
  const repo = url.searchParams.get("repo") ?? undefined;
  const pr = url.searchParams.get("pr") ?? undefined;
  const taskStatus = url.searchParams.get("taskStatus") ?? undefined;
  const assignee = url.searchParams.get("assignee") ?? undefined;
  const pageStr = url.searchParams.get("page");
  const pageSizeStr = url.searchParams.get("pageSize");

  const page = pageStr ? parseInt(pageStr, 10) : 1;
  const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : 20;

  const result = await queryDeliveryTasks({
    view,
    q,
    project,
    repo,
    pr,
    taskStatus,
    assignee,
    userAliases,
    page: isNaN(page) ? 1 : page,
    pageSize: isNaN(pageSize) ? 20 : pageSize,
  });

  return NextResponse.json(result);
}
