import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listSentryImports } from "@/lib/sentry/list";
import { sentryScopeFor } from "@/lib/sentry/scope";
import { SentryQuerySchema } from "@/lib/api/schemas/sentry";

export { listSentryImports };

/**
 * View of the Sentry import queue, scoped to the projects the authenticated
 * user is allowed to access (or all projects for admins).
 * Accepts `?state=a,b`, optional `?project=KEY`, `?q=TERM`, and `?sort=MODE`.
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

  const rawQ = url.searchParams.get("q") ?? undefined;
  const rawSort = url.searchParams.get("sort") ?? undefined;
  const parsed = SentryQuerySchema.safeParse({ q: rawQ, sort: rawSort });
  const opts = parsed.success ? parsed.data : undefined;

  const data = await listSentryImports(stateParam, scope, projectParam, opts);
  return NextResponse.json(data);
}
