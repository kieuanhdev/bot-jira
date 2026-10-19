import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listSentryImports } from "@/lib/sentry/list";
import { sentryScopeFor } from "@/lib/sentry/scope";

export { listSentryImports };

/**
 * View of the Sentry import queue, scoped to the projects the authenticated
 * user is allowed to access (or all projects for admins).
 * Accepts `?state=a,b` and optional `?project=KEY`.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const scope = await sentryScopeFor(session);
  const url = new URL(req.url);
  const stateParam = url.searchParams.get("state") ?? undefined;
  const projectParam = url.searchParams.get("project") ?? undefined;

  const data = await listSentryImports(stateParam, scope, projectParam);
  return NextResponse.json(data);
}
