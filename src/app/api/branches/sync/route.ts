import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { enqueueCheckBranches } from "@/lib/queue/boss";

export async function POST() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!can(session, "branch.sync")) {
    return NextResponse.json({ error: "forbidden: requires branch.sync permission" }, { status: 403 });
  }

  try {
    const jobId = await enqueueCheckBranches();
    if (jobId) {
      return NextResponse.json({ queued: true, jobId }, { status: 202 });
    }
    // Deduplicated: job with singletonKey already active
    return NextResponse.json(
      { queued: true, message: "Sync job is already in progress or enqueued" },
      { status: 202 }
    );
  } catch (err) {
    const msg = (err as Error).message || "Queue unavailable";
    return NextResponse.json(
      {
        error: `Background sync queue unavailable (${msg}). Long-running sync is disabled in HTTP requests.`,
      },
      { status: 503 }
    );
  }
}
