import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const USER_GATE_SELECT = {
  id: true,
  jiraUserEnc: true,
  jiraTokenEnc: true,
  jiraAuth: true,
  jiraVerifiedAt: true,
  jiraUsername: true,
  onboarded: true,
  role: true,
  boardProjects: true,
} as const;

export type UserGate = Prisma.UserGetPayload<{ select: typeof USER_GATE_SELECT }>;

/**
 * Request-scoped memoized user gate loader.
 * Uses React `cache()` to deduplicate user reads across layout and route pages
 * (e.g. board bootstrap, issue fallback, setup-jira) within the same server request.
 */
export const getCurrentUserGate = cache(async (userId: string): Promise<UserGate | null> => {
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: USER_GATE_SELECT,
  });
});
