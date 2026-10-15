import { NextResponse } from "next/server";
import { handleWebhook } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * Generic CI webhook receiver (M5-02). Accepts a minimal shape:
 *
 *   {
 *     "runId": "12345" | "run_id": 12345,   // required for dedupe
 *     "status": "success" | "failure" | "running" | ...,
 *     "branch": "main",
 *     "commit": "abc123",
 *     "repo": "team/app",
 *     "url": "https://ci.example/run/12345"   // optional link
 *   }
 *
 * External event id: `${status}:${repo}:${commit}:${runId}` — stable across
 * retries of the same run.
 */
function ciExternalId(json: unknown): string {
  const j = json as {
    runId?: string | number;
    run_id?: string | number;
    status?: string;
    repo?: string;
    commit?: string;
  };
  const runId = j.runId ?? j.run_id ?? "unknown";
  return `${j.status ?? "event"}:${j.repo ?? "default"}:${j.commit ?? ""}:${runId}`;
}

export async function POST(req: Request) {
  return handleWebhook("ci", req, (json) => {
    const j = json as { status?: string; repo?: string; branch?: string };
    return {
      externalId: ciExternalId(json),
      type: `ci:${j.status ?? "unknown"}`,
      subject: j.repo ?? null,
    };
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, source: "ci" });
}
