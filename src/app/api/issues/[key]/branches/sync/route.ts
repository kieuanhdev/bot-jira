import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userJiraAuth } from "@/lib/user-creds";
import { getSystemJiraAuth } from "@/lib/jira/client";
import { syncJiraDevStatusForIssue } from "@/lib/jira/dev-status";

export async function POST(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      jiraUsername: true,
    },
  });

  const auth = userJiraAuth(user) || (await getSystemJiraAuth());
  if (!auth) {
    return NextResponse.json(
      { error: "Chưa cấu hình tài khoản Jira trong hệ thống hoặc thiết lập người dùng." },
      { status: 428 }
    );
  }

  const result = await syncJiraDevStatusForIssue(key, auth);
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Không thể đồng bộ Jira Dev-Status" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    syncedBranches: result.syncedBranches,
    count: result.syncedBranches.length,
  });
}
