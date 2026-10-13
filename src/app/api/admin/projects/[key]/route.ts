import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/session";
import { isValidProjectKeyFormat, normalizeProjectKey } from "@/lib/jira/project-catalog";
import { toggleProjectSync } from "@/lib/admin/project-sync";

/** Admin-only: turn one project's Jira sync on or off. */
export async function PATCH(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const projectKey = normalizeProjectKey((await ctx.params).key);
  if (!isValidProjectKeyFormat(projectKey)) {
    return NextResponse.json({ error: "invalid_project_key" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { syncEnabled?: unknown };
  if (typeof body.syncEnabled !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await toggleProjectSync(projectKey, body.syncEnabled, {
    id: session.user.id,
    email: session.user.email,
  });
  if (!result) return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  return NextResponse.json(result);
}
