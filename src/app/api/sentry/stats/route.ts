import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sentryScopeFor } from "@/lib/sentry/scope";
import { getSentryStats } from "@/lib/sentry/stats";

export { getSentryStats };

/**
 * Overview statistics for Sentry issues (pending review, critical tier count,
 * new issues in 24h, noise ratio, and 7-day sparkline trend).
 * Scoped to user's permitted projects.
 * Optional query parameter: `?project=KEY`.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const scope = await sentryScopeFor(session);
  const url = new URL(req.url);
  const projectParam = url.searchParams.get("project") ?? undefined;

  const data = await getSentryStats(scope, projectParam);
  return NextResponse.json(data);
}
