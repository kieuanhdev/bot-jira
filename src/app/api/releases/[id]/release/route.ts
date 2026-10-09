import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { publishRelease } from "@/lib/releases/jira-mutation";

/**
 * Actually release a Jira Fix Version based on Jira Done and Git merge.
 *
 * Rules:
 *  - release_manager/admin only (permission: release.publish).
 *  - Delegated to `publishRelease` in `src/lib/releases/jira-mutation.ts`.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session, "release.publish")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const actorId = session.user?.id ?? null;
  const actorEmail = session.user?.email ?? null;
  const { id } = await ctx.params;

  const result = await publishRelease(id, { id: actorId, email: actorEmail });
  return NextResponse.json(result.body, { status: result.status });
}
