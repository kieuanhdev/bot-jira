import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { ProjectLeadersBodySchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { normalizeProjectKey, isValidProjectKeyFormat } from "@/lib/jira/project-catalog";
import {
  getProjectLeaders,
  setProjectLeaders,
  canUserManageProjectLeaders,
} from "@/lib/projects/roles";
import { audit } from "@/lib/audit";

async function getProjectKey(ctx: { params: Promise<{ key: string }> }): Promise<string> {
  const { key: rawKey } = await ctx.params;
  return normalizeProjectKey(rawKey);
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const projectKey = await getProjectKey(ctx);
  if (!projectKey || !isValidProjectKeyFormat(projectKey)) {
    return NextResponse.json({ error: "invalid project key" }, { status: 400 });
  }

  const [leaders, canManage] = await Promise.all([
    getProjectLeaders(projectKey),
    canUserManageProjectLeaders(session.user, projectKey),
  ]);

  return NextResponse.json({
    projectKey,
    leaders: leaders.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      jiraUsername: u.jiraUsername,
      role: u.role,
    })),
    canManage,
  });
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const projectKey = await getProjectKey(ctx);
  if (!projectKey || !isValidProjectKeyFormat(projectKey)) {
    return NextResponse.json({ error: "invalid project key" }, { status: 400 });
  }

  const canManage = await canUserManageProjectLeaders(session.user, projectKey);
  if (!canManage) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedBody = await readJsonBody(req, ProjectLeadersBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  if (!Array.isArray(body.leaderUserIds)) {
    return NextResponse.json(
      { error: "leaderUserIds must be an array" },
      { status: 400 }
    );
  }

  const userIds = body.leaderUserIds.map((id) => String(id).trim()).filter(Boolean);

  // Validate that all specified userIds actually exist
  if (userIds.length > 0) {
    const existingUsers = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    if (existingUsers.length !== userIds.length) {
      return NextResponse.json(
        { error: "one or more user IDs do not exist" },
        { status: 400 }
      );
    }
  }

  const beforeLeaders = await getProjectLeaders(projectKey);

  const result = await setProjectLeaders(projectKey, userIds, session.user.id);

  await audit({
    actorId: session.user.id,
    actorEmail: session.user.email ?? null,
    action: "project.leader.set",
    source: "web",
    target: projectKey,
    before: { leaderUserIds: beforeLeaders.map((u) => u.id) },
    after: { leaderUserIds: userIds },
  });

  return NextResponse.json({
    success: true,
    projectKey,
    leaders: result.leaders.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      jiraUsername: u.jiraUsername,
      role: u.role,
    })),
    added: result.added,
    removed: result.removed,
  });
}
