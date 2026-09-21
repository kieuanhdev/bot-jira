import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith } from "@/lib/jira/client";
import {
  previewBulk,
  confirmBulk,
  type BulkAction,
} from "@/lib/bulk/ops";
import { enqueueBulkOperation } from "@/lib/queue/boss";

/**
 * M4-02 — Preview + confirm a bulk operation.
 *
 * The request body always includes `action` + `keys`. If `confirm: true` and
 * `operationId` match a `preview` operation the caller created earlier, the
 * operation is confirmed and enqueued for background execution. Otherwise a
 * fresh preview is computed (no mutation) and returned.
 *
 * Confirming requires the exact operation id from a prior preview, which is the
 * "confirm by operation id" guard: a client cannot mutate without first
 * previewing and then explicitly confirming that operation.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    keys?: string[];
    action?: BulkAction;
    confirm?: boolean;
    operationId?: string;
  };

  const keys = body.keys ?? [];
  const action = body.action;
  if (!action || !Array.isArray(keys) || keys.length === 0) {
    return NextResponse.json({ error: "keys and action required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const jira = jiraWith(userJiraAuth(user));

  if (body.confirm && body.operationId) {
    // Confirm path: validate the operation belongs to this user and is a preview.
    const existing = await prisma.bulkOperation.findUnique({
      where: { id: body.operationId },
      select: { id: true, requestedBy: true, state: true },
    });
    if (!existing || existing.requestedBy !== session.user.id) {
      return NextResponse.json({ error: "operation not found" }, { status: 404 });
    }
    if (existing.state !== "preview") {
      return NextResponse.json({ error: "operation already confirmed" }, { status: 409 });
    }
    try {
      const res = await confirmBulk(body.operationId, session.user.id);
      const jobId = await enqueueBulkOperation(body.operationId);
      return NextResponse.json({
        operationId: res.operationId,
        total: res.total,
        actionable: res.actionable,
        queued: Boolean(jobId),
      });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  // Preview path.
  try {
    const preview = await previewBulk(action, keys, session.user.id, jira);
    return NextResponse.json(preview);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
