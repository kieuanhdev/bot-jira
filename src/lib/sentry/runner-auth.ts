import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Guard for `/api/runner/sentry/*`: the host-side runner sends
 * `Authorization: Bearer <SENTRY_RUNNER_TOKEN>`. Fails closed (503) when no
 * token is configured. Returns a Response to send back, or null when allowed.
 */
export function rejectUnlessRunner(req: Request): NextResponse | null {
  const expected = env.sentryRunnerToken;
  if (!expected) return NextResponse.json({ error: "runner_disabled" }, { status: 503 });
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
