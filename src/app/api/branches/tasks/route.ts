import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listDeliveryTasksForUser } from "@/lib/branches/list-route-service";

export { listDeliveryTasksForUser };

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const rawView = url.searchParams.get("view");
  const view = (
    rawView === "needs-attention" || rawView === "pending-review" || rawView === "unlinked"
      ? rawView
      : "my-work"
  ) as "my-work" | "needs-attention" | "pending-review" | "unlinked";
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

  const data = await listDeliveryTasksForUser(session.user, {
    view,
    q,
    project,
    repo,
    pr,
    taskStatus,
    assignee,
    page,
    pageSize,
  });

  return NextResponse.json(data);
}
