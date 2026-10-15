import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeProjectKey } from "@/lib/jira/project-catalog";

export type ProjectLeaderUser = Pick<
  User,
  "id" | "displayName" | "email" | "jiraUsername" | "role"
>;

/**
 * Get all configured leaders for a given project.
 */
export async function getProjectLeaders(projectKey: string): Promise<User[]> {
  const normKey = normalizeProjectKey(projectKey);
  if (!normKey) return [];

  const members = await prisma.projectMember.findMany({
    where: {
      projectKey: normKey,
      role: "leader",
    },
    include: {
      user: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return members.map((m) => m.user);
}

/**
 * Check if a user is a leader of a specific project.
 */
export async function isProjectLeader(
  projectKey: string,
  userId: string
): Promise<boolean> {
  const normKey = normalizeProjectKey(projectKey);
  if (!normKey || !userId) return false;

  const member = await prisma.projectMember.findFirst({
    where: {
      projectKey: normKey,
      userId,
      role: "leader",
    },
    select: { userId: true },
  });

  return Boolean(member);
}

/**
 * List all project keys led by a user.
 */
export async function listProjectsLedBy(userId: string): Promise<string[]> {
  if (!userId) return [];

  const members = await prisma.projectMember.findMany({
    where: {
      userId,
      role: "leader",
    },
    select: { projectKey: true },
    orderBy: { projectKey: "asc" },
  });

  return members.map((m) => m.projectKey);
}

/**
 * Check whether a user is authorized to manage leaders for a project.
 * Authorized if:
 * 1. User has "admin" role, OR
 * 2. User is currently an active leader of this project.
 */
export async function canUserManageProjectLeaders(
  sessionUser: { id?: string; role?: string } | null | undefined,
  projectKey: string
): Promise<boolean> {
  if (!sessionUser?.id) return false;
  if (sessionUser.role === "admin") return true;
  return isProjectLeader(projectKey, sessionUser.id);
}

/**
 * Check whether a user is authorized to manage leaders for at least one project.
 * Authorized if:
 * 1. User has "admin" role, OR
 * 2. User is currently an active leader of at least one project.
 */
export async function canUserManageAnyProjectLeaders(
  sessionUser: { id?: string; role?: string } | null | undefined
): Promise<boolean> {
  if (!sessionUser?.id) return false;
  if (sessionUser.role === "admin") return true;
  const projects = await listProjectsLedBy(sessionUser.id);
  return projects.length > 0;
}

export type SetProjectLeadersResult = {
  projectKey: string;
  leaders: User[];
  added: string[];
  removed: string[];
};

/**
 * Replace the leaders for a project atomically in a transaction.
 */
export async function setProjectLeaders(
  projectKey: string,
  userIds: string[],
  actorId?: string
): Promise<SetProjectLeadersResult> {
  const normKey = normalizeProjectKey(projectKey);
  if (!normKey) {
    throw new Error("Invalid project key");
  }

  const targetUserIds = Array.from(new Set(userIds.filter(Boolean)));

  return prisma.$transaction(async (tx) => {
    // 1. Get current leaders
    const currentMembers = await tx.projectMember.findMany({
      where: {
        projectKey: normKey,
        role: "leader",
      },
      select: { userId: true },
    });
    const currentIds = new Set(currentMembers.map((m) => m.userId));

    const added = targetUserIds.filter((id) => !currentIds.has(id));
    const removed = Array.from(currentIds).filter((id) => !targetUserIds.includes(id));

    // 2. Remove members no longer in leader list
    if (removed.length > 0) {
      await tx.projectMember.deleteMany({
        where: {
          projectKey: normKey,
          userId: { in: removed },
          role: "leader",
        },
      });
    }

    // 3. Upsert added leaders
    for (const userId of added) {
      await tx.projectMember.upsert({
        where: {
          projectKey_userId: {
            projectKey: normKey,
            userId,
          },
        },
        create: {
          projectKey: normKey,
          userId,
          role: "leader",
          assignedById: actorId ?? null,
        },
        update: {
          role: "leader",
          assignedById: actorId ?? null,
        },
      });
    }

    // 4. Fetch updated leaders
    const updatedMembers = await tx.projectMember.findMany({
      where: {
        projectKey: normKey,
        role: "leader",
      },
      include: {
        user: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return {
      projectKey: normKey,
      leaders: updatedMembers.map((m) => m.user),
      added,
      removed,
    };
  });
}
