import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getMembershipRefreshStatus } from "@/lib/jira/board-membership-store";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const project = (url.searchParams.get("project") ?? "").trim().toUpperCase();
  const rawBoardId = url.searchParams.get("boardId");
  const boardId = rawBoardId ? Number.parseInt(rawBoardId, 10) : NaN;

  if (!project || !/^[A-Z][A-Z0-9_]{1,19}$/.test(project)) {
    return NextResponse.json({ error: "Project key không hợp lệ.", code: "invalid_project" }, { status: 400 });
  }
  if (!Number.isInteger(boardId) || boardId <= 0) {
    return NextResponse.json({ error: "Board ID phải là số nguyên dương.", code: "invalid_board" }, { status: 400 });
  }

  const status = await getMembershipRefreshStatus(session.user.id, project, boardId);

  return NextResponse.json({
    ok: true,
    projectKey: project,
    boardId,
    ...status,
  });
}
