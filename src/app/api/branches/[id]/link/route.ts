import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  confirmBranchLink,
  confirmAllBranchSuggestions,
  rejectBranchSuggestion,
  manualRelinkBranch,
  manualRelinkBranches,
  manualUnlinkBranch,
} from "@/lib/bitbucket/link-service";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action.toLowerCase() : null;
  const rawJiraKey = body.jiraKey !== undefined ? body.jiraKey : undefined;
  const reason = typeof body.reason === "string" ? body.reason : undefined;

  // Determine intent
  if (action === "link_many") {
    if (!can(session, "branch.manage")) {
      return NextResponse.json({ error: "forbidden: requires branch.manage" }, { status: 403 });
    }
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    if (typeof rawJiraKey !== "string" || !rawJiraKey.trim()) {
      return NextResponse.json({ error: "Thiếu mã Jira" }, { status: 400 });
    }
    const res = await manualRelinkBranches(ids, rawJiraKey, session.user.id, session.user.email ?? undefined, reason, {
      replace: body.replace === true,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, count: res.count, failed: res.failed });
  }

  if (action === "confirm_all" || id === "all") {
    if (!can(session, "branch.confirm")) {
      return NextResponse.json({ error: "forbidden: requires branch.confirm" }, { status: 403 });
    }
    const res = await confirmAllBranchSuggestions(session.user.id, session.user.email ?? undefined);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, count: res.count });
  }

  if (action === "confirm") {
    if (!can(session, "branch.confirm")) {
      return NextResponse.json({ error: "forbidden: requires branch.confirm" }, { status: 403 });
    }
    const res = await confirmBranchLink(id, session.user.id, session.user.email ?? undefined, reason);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, branch: res.branch });
  }

  if (action === "reject") {
    if (!can(session, "branch.manage")) {
      return NextResponse.json({ error: "forbidden: requires branch.manage" }, { status: 403 });
    }
    const res = await rejectBranchSuggestion(id, session.user.id, session.user.email ?? undefined, reason);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, branch: res.branch });
  }

  // Unlink
  if (action === "unlink" || rawJiraKey === null) {
    if (!can(session, "branch.manage")) {
      return NextResponse.json({ error: "forbidden: requires branch.manage" }, { status: 403 });
    }
    const unlinkKey = typeof body.unlinkJiraKey === "string" ? body.unlinkJiraKey : undefined;
    const res = await manualUnlinkBranch(id, session.user.id, session.user.email ?? undefined, reason, unlinkKey);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, branch: res.branch });
  }

  // Link or relink
  if (typeof rawJiraKey === "string" && rawJiraKey.trim()) {
    if (!can(session, "branch.manage")) {
      return NextResponse.json({ error: "forbidden: requires branch.manage" }, { status: 403 });
    }
    const res = await manualRelinkBranch(id, rawJiraKey, session.user.id, session.user.email ?? undefined, reason, {
      replace: body.replace === true,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, branch: res.branch });
  }

  return NextResponse.json({ error: "Invalid action or parameters" }, { status: 400 });
}
