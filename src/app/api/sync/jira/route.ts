import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  normalizeProjectKey,
  isValidProjectKeyFormat,
} from "@/lib/jira/project-catalog";
import { enqueueJiraProjectSync, enqueueJiraDispatch } from "@/lib/queue/boss";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { projectKey?: string; full?: boolean };
  const requestedAt = new Date().toISOString();
  const isAdmin = session.user.role === "admin";
  const full = Boolean(body.full && isAdmin);

  const rawKey = body.projectKey?.trim();
  if (rawKey) {
    const projectKey = normalizeProjectKey(rawKey);
    if (!isValidProjectKeyFormat(projectKey)) {
      return NextResponse.json({ error: "unknown_project" }, { status: 400 });
    }

    try {
      const jobId = await enqueueJiraProjectSync({
        projectKey,
        full,
        source: isAdmin ? "admin" : "manual",
        requestedBy: session.user.id,
        requestedAt,
      });

      const state = jobId ? "queued" : "already_running";
      return NextResponse.json(
        {
          state,
          queued: Boolean(jobId),
          jobId,
          projectKey,
          full,
          acceptedAt: requestedAt,
        },
        { status: 202 }
      );
    } catch {
      return NextResponse.json({ error: "queue_unavailable" }, { status: 503 });
    }
  }

  // No projectKey provided:
  // Non-admins must specify a projectKey
  if (!isAdmin) {
    return NextResponse.json({ error: "project_required" }, { status: 400 });
  }

  // Admins can dispatch all-project sync
  try {
    const jobId = await enqueueJiraDispatch({
      full,
      source: "admin",
      requestedBy: session.user.id,
    });

    const state = jobId ? "queued" : "already_running";
    return NextResponse.json(
      {
        state,
        queued: Boolean(jobId),
        jobId,
        projectKey: null,
        full,
        acceptedAt: requestedAt,
      },
      { status: 202 }
    );
  } catch {
    return NextResponse.json({ error: "queue_unavailable" }, { status: 503 });
  }
}
