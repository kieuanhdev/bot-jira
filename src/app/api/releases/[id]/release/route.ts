import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notifyAll } from "@/lib/notify";
import { jiraWith } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { getReleaseReadiness } from "@/lib/releases/release-readiness";

/**
 * Actually release a Jira Fix Version based on Jira Done and Git merge.
 *
 * Rules:
 *  - release_manager/admin only (permission: release.publish).
 *  - Idempotent: releasing an already-released version returns success without re-calling Jira.
 *  - Evaluates Jira Done and Bitbucket Git delivery immediately before mutation.
 *  - An empty release, incomplete tasks, or unmerged PRs return 409 with structured blockers.
 *  - Only marks the DB released after Jira confirms the mutation.
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
  });
  if (!release) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Idempotency: already marked released locally
  if (release.status === "released") {
    return NextResponse.json({
      ok: true,
      released: true,
      already: true,
      releasedAt: release.releasedAt?.toISOString() ?? null,
    });
  }

  // Need a Jira Fix Version to release
  if (!release.jiraVersionId || !release.projectKey) {
    return NextResponse.json(
      { error: "release is not tied to a Jira Fix Version (projectKey + jiraVersionId required)" },
      { status: 409 }
    );
  }

  // Personal Jira credentials required for mutation
  const user = await prisma.user.findUnique({
    where: { id: actorId ?? "" },
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

  // Check Jira version directly
  try {
    let jiraVersion = null;
    if (typeof client.getVersion === "function") {
      jiraVersion = await client.getVersion(release.jiraVersionId).catch(() => null);
    }
    if (!jiraVersion && typeof client.getVersions === "function") {
      const versions = await client.getVersions(release.projectKey).catch(() => []);
      jiraVersion = versions.find((v) => v.id === release.jiraVersionId) || null;
    }

    if (jiraVersion) {
      if (jiraVersion.released) {
        // Idempotent sync from Jira
        const updated = await prisma.release.update({
          where: { id },
          data: { status: "released", releasedAt: new Date() },
          select: { id: true, version: true, releasedAt: true, status: true },
        });
        return NextResponse.json({
          ok: true,
          released: true,
          already: true,
          releasedAt: updated.releasedAt?.toISOString() ?? null,
        });
      }
      if (jiraVersion.archived) {
        return NextResponse.json(
          { error: "VERSION_ARCHIVED", message: "Fix Version đã bị lưu trữ trên Jira." },
          { status: 409 }
        );
      }
    }
  } catch {
    // Proceed to readiness check
  }

  // Evaluate release readiness from Jira tasks and Git branch/PR data
  const readiness = await getReleaseReadiness(id);
  if (!readiness) {
    return NextResponse.json({ error: "could not evaluate release readiness" }, { status: 500 });
  }

  if (readiness.state !== "ready") {
    await audit({
      actorId,
      actorEmail,
      action: "release.publish_failed",
      source: "web",
      target: release.jiraVersionId,
      after: {
        reason: readiness.state === "empty" ? "EMPTY_RELEASE" : "RELEASE_NOT_READY",
        taskCount: readiness.taskCount,
        blockersCount: readiness.blockers.length,
      },
    });

    return NextResponse.json(
      {
        error: readiness.state === "empty" ? "EMPTY_RELEASE" : "RELEASE_NOT_READY",
        readiness: readiness.state,
        taskCount: readiness.taskCount,
        doneCount: readiness.doneCount,
        gitCompleteCount: readiness.gitCompleteCount,
        deliveryReadyCount: readiness.deliveryReadyCount,
        blockers: readiness.blockers,
      },
      { status: 409 }
    );
  }

  // Ready: call Jira mutation once
  try {
    await client.releaseVersion(release.jiraVersionId);
  } catch (e) {
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

  // Update local DB to released after Jira confirms
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
