import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface ResolvedVersionFilter {
  versionId: string | null;
  versionName: string | null;
  jiraVersionId: string | null;
  releaseDate: Date | null;
  startDate: Date | null;
  whereInput?: Prisma.IssueCacheWhereInput;
}

/**
 * Resolves a versionId parameter (which might be a Prisma Release ID (cuid),
 * a Jira version ID, or a version name) into consistent issue filter conditions.
 */
export async function resolveProjectVersionFilter(
  projectKey: string,
  versionId?: string | null
): Promise<ResolvedVersionFilter | null> {
  if (!versionId || versionId === "all") {
    return null;
  }

  // Look up release record
  const release = await prisma.release.findFirst({
    where: {
      projectKey,
      OR: [
        { id: versionId },
        { jiraVersionId: versionId },
        { version: versionId },
      ],
    },
    select: {
      id: true,
      jiraVersionId: true,
      version: true,
      releaseDate: true,
      createdAt: true,
    },
  });

  if (release) {
    const conditions: Prisma.IssueCacheWhereInput[] = [];
    if (release.jiraVersionId) {
      conditions.push({ fixVersionIds: { has: release.jiraVersionId } });
    }
    if (release.version) {
      conditions.push({ fixVersionNames: { has: release.version } });
    }

    return {
      versionId: release.jiraVersionId || release.id,
      versionName: release.version,
      jiraVersionId: release.jiraVersionId,
      releaseDate: release.releaseDate,
      startDate: release.createdAt,
      whereInput: conditions.length > 1 ? { OR: conditions } : conditions[0] || {},
    };
  }

  // If not found in Release table, check if it matches Jira version ID or name directly
  return {
    versionId,
    versionName: versionId,
    jiraVersionId: versionId,
    releaseDate: null,
    startDate: null,
    whereInput: {
      OR: [
        { fixVersionIds: { has: versionId } },
        { fixVersionNames: { has: versionId } },
      ],
    },
  };
}
