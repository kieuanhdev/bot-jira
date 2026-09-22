/**
 * M6-01 — Chat identity linking.
 *
 * A chat account (e.g. a Discord user id) must be explicitly linked to a Team
 * Task Web user before it can run any command. Commands execute with the linked
 * user's role and Jira credential; the chat token is never a Jira identity.
 */

import { prisma } from "@/lib/prisma";

export type ChatIdentityRow = {
  id: string;
  provider: string;
  externalId: string;
  userId: string;
  displayName: string | null;
};

/** Find the Team Task Web user linked to a chat account, or null. */
export async function findUserByChatIdentity(
  provider: string,
  externalId: string
): Promise<{ userId: string; jiraUsername: string | null; role: string } | null> {
  const identity = await prisma.chatIdentity.findUnique({
    where: { externalId },
    select: { userId: true, provider: true },
  });
  if (!identity || identity.provider !== provider) return null;
  const user = await prisma.user.findUnique({
    where: { id: identity.userId },
    select: { id: true, jiraUsername: true, role: true },
  });
  if (!user) return null;
  return { userId: user.id, jiraUsername: user.jiraUsername, role: user.role };
}

/** Link a chat account to the given user (idempotent per provider+user). */
export async function linkChatIdentity(args: {
  userId: string;
  provider: string;
  externalId: string;
  displayName?: string;
}): Promise<ChatIdentityRow> {
  const existing = await prisma.chatIdentity.findFirst({
    where: { provider: args.provider, userId: args.userId },
  });
  if (existing) {
    return prisma.chatIdentity.update({
      where: { id: existing.id },
      data: {
        externalId: args.externalId,
        displayName: args.displayName ?? existing.displayName,
      },
    });
  }
  return prisma.chatIdentity.create({
    data: {
      provider: args.provider,
      externalId: args.externalId,
      displayName: args.displayName ?? null,
      userId: args.userId,
      linkedById: args.userId,
    },
  });
}

/** Unlink a chat account for a user. Returns true when a row was removed. */
export async function unlinkChatIdentity(userId: string, provider: string): Promise<boolean> {
  const res = await prisma.chatIdentity.deleteMany({
    where: { provider, userId },
  });
  return res.count > 0;
}

/** All identities linked to a user (for the settings UI). */
export async function listIdentitiesForUser(userId: string) {
  return prisma.chatIdentity.findMany({
    where: { userId },
    orderBy: { provider: "asc" },
  });
}
