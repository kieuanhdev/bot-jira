import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isKnownProject } from "@/lib/env";
import { enqueueJiraSync } from "@/lib/queue/boss";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { projectKey?: string; full?: boolean };
  const projectKey = body.projectKey?.trim().toUpperCase();
  if (projectKey && !isKnownProject(projectKey)) {
    return NextResponse.json({ error: "unknown_project" }, { status: 400 });
  }
  const full = Boolean(body.full && session.user.role === "admin");
  try {
    const jobId = await enqueueJiraSync({ projectKey, full, requestedBy: session.user.id });
    return NextResponse.json({ queued: Boolean(jobId), jobId, projectKey: projectKey ?? null, full }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "queue_unavailable" }, { status: 503 });
  }
}
