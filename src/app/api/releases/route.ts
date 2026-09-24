import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { jiraWith, JiraRequestError } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";

/** List releases, optionally filtered by project. Includes task counts. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const projectKey = url.searchParams.get("projectKey")?.trim() || undefined;

  const releases = await prisma.release.findMany({
    where: projectKey ? { projectKey } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      tasks: {
        select: {
          jiraKey: true,
          issue: {
            select: {
              status: true,
              statusCategory: true,
              summary: true,
              points: true,
              priority: true,
            },
          },
        },
      },
    },
  });

  const items = releases.map((r) => {
    const doneCount = r.tasks.filter(
      (t) => t.issue.statusCategory === "done"
    ).length;
    return { ...r, taskCount: r.tasks.length, doneCount };
  });

  return NextResponse.json({ items });
}

/**
 * Create a release. New releases are identified by a Jira Fix Version:
 * { projectKey, jiraVersionId? , version, description?, targetLabel? }.
 *
 * - If jiraVersionId is provided, it must already exist in Jira.
 * - Otherwise a new Jira Fix Version is created (using the caller's personal
 *   token per ADR-002) and the returned id is stored as the release identity.
 * - Legacy label-based releases (targetLabel only, no projectKey) are still
 *   accepted for backward compatibility.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    projectKey?: string;
    jiraVersionId?: string;
    version: string;
    description?: string;
    targetLabel?: string;
    notes?: string;
  };

  if (!body.version || !body.version.trim()) {
    return NextResponse.json({ error: "version required" }, { status: 400 });
  }

  const projectKey = body.projectKey?.trim() ?? "";
  const targetLabel = body.targetLabel?.trim() ?? "";

  if (!projectKey && !targetLabel) {
    return NextResponse.json(
      { error: "projectKey (with a Jira Fix Version) or a legacy targetLabel is required" },
      { status: 400 }
    );
  }

  const userId = session.user.id;

  // Resolve the Jira Fix Version identity.
  let jiraVersionId: string | null = null;
  let releaseDate: Date | null = null;

  if (projectKey) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
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

    try {
      if (body.jiraVersionId) {
        // Verify the requested version exists in Jira before persisting.
        const versions = await client.getVersions(projectKey);
        const match = versions.find((v) => v.id === body.jiraVersionId);
        if (!match) {
          return NextResponse.json(
            { error: `Jira Fix Version ${body.jiraVersionId} not found in project ${projectKey}` },
            { status: 404 }
          );
        }
        jiraVersionId = match.id;
        releaseDate = match.releaseDate ? new Date(match.releaseDate) : null;
      } else {
        // No version given: create a new Fix Version in Jira.
        const created = await client.createVersion(projectKey, body.version, body.description);
        if (!created?.id) {
          return NextResponse.json(
            { error: "Jira did not return a version id while creating the Fix Version" },
            { status: 502 }
          );
        }
        jiraVersionId = created.id;
        releaseDate = created.releaseDate ? new Date(created.releaseDate) : null;
      }
    } catch (e) {
      const msg = e instanceof JiraRequestError ? e.message : (e as Error).message;
      return NextResponse.json({ error: `Jira version lookup failed: ${msg}` }, { status: 502 });
    }
  }

  // Persist. A Jira-version release is identified by (projectKey,
  // jiraVersionId); a legacy label release is identified by targetLabel (no
  // longer a Prisma unique field, so we locate the row first, then
  // update-or-create).
  let release: Awaited<ReturnType<typeof prisma.release.findUniqueOrThrow>>;
  if (jiraVersionId) {
    const found = await prisma.release.findFirst({
      where: { projectKey, jiraVersionId },
    });
    if (found) {
      release = await prisma.release.update({
        where: { id: found.id },
        data: {
          version: body.version,
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(releaseDate ? { releaseDate } : {}),
        },
      });
    } else {
      release = await prisma.release.create({
        data: {
          version: body.version,
          projectKey,
          jiraVersionId,
          description: body.description ?? "",
          ...(releaseDate ? { releaseDate } : {}),
          createdById: userId,
          notes: body.notes ?? "",
        },
      });
    }
  } else {
    // Legacy label-based release (no Jira Fix Version).
    const found = await prisma.release.findFirst({
      where: { targetLabel, jiraVersionId: null },
    });
    if (found) {
      release = await prisma.release.update({
        where: { id: found.id },
        data: {
          version: body.version,
          projectKey,
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
      });
    } else {
      release = await prisma.release.create({
        data: {
          version: body.version,
          projectKey,
          targetLabel,
          description: body.description ?? "",
          createdById: userId,
          notes: body.notes ?? "",
        },
      });
    }

    // Attach all cached issues carrying the target label.
    const issues = await prisma.issueCache.findMany({
      where: { labels: { has: targetLabel } },
      select: { jiraKey: true },
    });
    if (issues.length) {
      await prisma.releaseTask.createMany({
        data: issues.map((i) => ({ releaseId: release.id, jiraKey: i.jiraKey })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json({ release });
}
