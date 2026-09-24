import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { aiProvider } from "@/lib/ai";
import { notifyAll } from "@/lib/notify";
import { runGates, aggregateGates, collectBlockers } from "@/lib/releases/gates";
import { buildReleaseContext } from "@/lib/releases/release-context";
import { jiraWith } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";

/**
 * REL-02 — Actually release a Jira Fix Version.
 *
 * Safety rules (plan §REL-02):
 *  - release_manager/admin only.
 *  - Idempotent: releasing an already-released version returns success.
 *  - Re-runs the mandatory gates immediately before the Jira mutation (a stale
 *    ready-check is never the sole basis for release).
 *  - An empty release or any failed/unknown mandatory gate => 409, no mutation.
 *  - Only marks the DB released after Jira confirms the mutation.
 *  - Jira is called at most once per request; concurrent requests are guarded
 *    by the already-released check + the release status flip.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session, "release.publish")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const actorId = session.user?.id ?? null;
  const actorEmail = session.user?.email ?? null;
  const { id } = await ctx.params;

  const release = await prisma.release.findUnique({
    where: { id },
    include: { tasks: { select: { jiraKey: true } } },
  });
  if (!release) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Idempotency: already released.
  if (release.status === "released") {
    return NextResponse.json({
      ok: true,
      released: true,
      already: true,
      releasedAt: release.releasedAt?.toISOString() ?? null,
    });
  }

  // Need a Jira Fix Version to release.
  if (!release.jiraVersionId || !release.projectKey) {
    return NextResponse.json(
      { error: "release is not tied to a Jira Fix Version (projectKey + jiraVersionId required)" },
      { status: 409 }
    );
  }

  // Re-run the gates now, immediately before the mutation.
  const releaseCtx = await buildReleaseContext(id, release.version);
  if (!releaseCtx) return NextResponse.json({ error: "could not build release context" }, { status: 500 });
  const gates = await runGates(releaseCtx, aiProvider.releaseCheck.bind(aiProvider));
  const status = aggregateGates(gates);
  const blockers = collectBlockers(gates);

  if (releaseCtx.tasks.length === 0) {
    return NextResponse.json(
      { error: "EMPTY_RELEASE", status: "blocked", blockers },
      { status: 409 }
    );
  }
  if (status === "blocked" || status === "unknown") {
    return NextResponse.json(
      { error: "release not ready", status, blockers, gates },
      { status: 409 }
    );
  }

  // Call Jira as the actor. Interactive mutations never use system auth.
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user);
  if (!auth) {
    return NextResponse.json(
      { error: "Bạn cần cấu hình token Jira cá nhân trong Settings.", code: "jira_credentials_required" },
      { status: 428 }
    );
  }
  const client = jiraWith(auth);
  let jiraOk = false;
  try {
    await client.releaseVersion(release.jiraVersionId);
    jiraOk = true;
  } catch (e) {
    // Jira mutation failed: do NOT flip the DB to released.
    await audit({
      actorId,
      actorEmail,
      action: "release.publish_failed",
      source: "web",
      target: release.jiraVersionId,
      after: { error: (e as Error).message.slice(0, 300) },
    });
    return NextResponse.json(
      { error: "Jira release failed", detail: (e as Error).message.slice(0, 200) },
      { status: 502 }
    );
  }

  if (!jiraOk) {
    return NextResponse.json({ error: "Jira release failed" }, { status: 502 });
  }

  // Jira confirmed. Persist released + audit + notify.
  const updated = await prisma.release.update({
    where: { id },
    data: { status: "released", releasedAt: new Date() },
    select: { id: true, version: true, releasedAt: true, status: true },
  });

  await audit({
    actorId,
    actorEmail,
    action: "release.publish",
    source: "web",
    target: release.jiraVersionId,
    before: { status: release.status },
    after: { status: "released", version: release.version },
  });

  await notifyAll({
    type: "release",
    title: `Bản phát hành ${release.version} đã được công bố`,
    body: `Fix Version ${release.projectKey} được phát hành bởi ${actorEmail ?? "release manager"}.`,
    link: "/release",
    severity: "success",
    eventKey: `release:${release.id}:published`,
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    released: true,
    already: false,
    release: updated,
  });
}
