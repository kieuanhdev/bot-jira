import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isKnownProject } from "@/lib/env";

export const dynamic = "force-dynamic";

export type JiraSyncStatusState = "queued" | "running" | "succeeded" | "failed" | "unknown";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawProject = searchParams.get("projectKey")?.trim();
  if (!rawProject) {
    return NextResponse.json({ error: "missing_project_key" }, { status: 400 });
  }

  const projectKey = rawProject.toUpperCase();
  const isFormatValid = /^[A-Z][A-Z0-9_]{1,19}$/.test(projectKey);
  if (!isKnownProject(projectKey) && !isFormatValid) {
    return NextResponse.json({ error: "invalid_project_key" }, { status: 400 });
  }

  const sinceParam = searchParams.get("since");
  const sinceDate = sinceParam ? new Date(sinceParam) : null;
  const validSince = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null;

  const cursor = await prisma.integrationCursor.findUnique({
    where: { integration_scope: { integration: "jira", scope: projectKey } },
    select: {
      lastStartedAt: true,
      lastSuccessAt: true,
      lastErrorAt: true,
      lastError: true,
    },
  }).catch(() => null);

  if (!cursor) {
    return NextResponse.json({
      projectKey,
      state: "unknown" as JiraSyncStatusState,
      lastStartedAt: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastError: null,
    });
  }

  const startedMs = cursor.lastStartedAt?.getTime() ?? 0;
  const successMs = cursor.lastSuccessAt?.getTime() ?? 0;
  const errorMs = cursor.lastErrorAt?.getTime() ?? 0;

  let state: JiraSyncStatusState = "unknown";

  if (validSince) {
    // 1-second clock skew tolerance
    const sinceMs = validSince.getTime() - 1000;
    const now = Date.now();

    if (successMs >= sinceMs && successMs >= startedMs && successMs >= errorMs) {
      state = "succeeded";
    } else if (errorMs >= sinceMs && errorMs >= successMs && (!cursor.lastSuccessAt || errorMs >= startedMs)) {
      state = "failed";
    } else if (startedMs >= sinceMs && startedMs > successMs && startedMs > errorMs) {
      state = "running";
    } else if (startedMs < sinceMs && successMs < sinceMs && errorMs < sinceMs) {
      // Not yet started since the request timestamp. If waited > 5 min, mark unknown.
      state = (now - validSince.getTime() > 5 * 60_000) ? "unknown" : "queued";
    } else {
      state = "unknown";
    }
  } else {
    // Without since timestamp, derive current known state
    if (startedMs > successMs && startedMs > errorMs && (Date.now() - startedMs < 10 * 60_000)) {
      state = "running";
    } else if (errorMs > successMs) {
      state = "failed";
    } else if (successMs > 0) {
      state = "succeeded";
    } else {
      state = "unknown";
    }
  }

  // Sanitize lastError for safe client display
  const sanitizedError = cursor.lastError
    ? cursor.lastError.replace(/(token|password|bearer|auth)[=:\s]+[^\s,;]+/gi, "$1=***").slice(0, 200)
    : null;

  return NextResponse.json({
    projectKey,
    state,
    lastStartedAt: cursor.lastStartedAt?.toISOString() ?? null,
    lastSuccessAt: cursor.lastSuccessAt?.toISOString() ?? null,
    lastErrorAt: cursor.lastErrorAt?.toISOString() ?? null,
    lastError: sanitizedError,
  });
}
