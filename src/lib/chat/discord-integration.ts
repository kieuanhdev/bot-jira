import { encrypt, safeDecrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { isDiscordWebhookUrl } from "./discord";

export type DiscordDestinationType = "webhook" | "user_id";

export function isDiscordUserId(value: string): boolean {
  return /^\d{15,22}$/.test(value);
}

export async function getDiscordIntegration(userId: string) {
  const row = await prisma.discordIntegration.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    destinationType: row.destinationType as DiscordDestinationType,
    discordUserId: row.discordUserId,
    webhookConfigured: Boolean(row.webhookUrlEnc),
    updatedAt: row.updatedAt,
  };
}

export async function saveDiscordIntegration(args: {
  userId: string;
  destinationType: DiscordDestinationType;
  discordUserId?: string;
  webhookUrl?: string;
}) {
  const discordUserId = args.discordUserId?.trim() || null;
  const webhookUrl = args.webhookUrl?.trim() || null;

  if (args.destinationType === "user_id" && (!discordUserId || !isDiscordUserId(discordUserId))) {
    throw new Error("Discord User ID must contain 15–22 digits");
  }
  if (args.destinationType === "webhook" && (!webhookUrl || !isDiscordWebhookUrl(webhookUrl))) {
    throw new Error("Enter a valid Discord webhook URL");
  }

  const encryptedWebhook = args.destinationType === "webhook" ? encrypt(webhookUrl!) : null;
  return prisma.$transaction(async (tx) => {
    if (args.destinationType === "user_id" && discordUserId) {
      const owner = await tx.chatIdentity.findUnique({ where: { externalId: discordUserId } });
      if (owner && owner.userId !== args.userId) {
        throw new Error("This Discord User ID is already linked to another account");
      }
    }

    const integration = await tx.discordIntegration.upsert({
      where: { userId: args.userId },
      create: {
        userId: args.userId,
        destinationType: args.destinationType,
        discordUserId: args.destinationType === "user_id" ? discordUserId : null,
        webhookUrlEnc: encryptedWebhook,
      },
      update: {
        destinationType: args.destinationType,
        discordUserId: args.destinationType === "user_id" ? discordUserId : null,
        webhookUrlEnc: encryptedWebhook,
      },
    });

    // A user-ID destination also links the identity used by inbound commands.
    if (args.destinationType === "user_id" && discordUserId) {
      await tx.chatIdentity.upsert({
        where: { provider_userId: { provider: "discord", userId: args.userId } },
        create: {
          provider: "discord",
          externalId: discordUserId,
          userId: args.userId,
          linkedById: args.userId,
        },
        update: { externalId: discordUserId },
      });
    }
    return integration;
  });
}

export async function removeDiscordIntegration(userId: string): Promise<boolean> {
  const result = await prisma.discordIntegration.deleteMany({ where: { userId } });
  return result.count > 0;
}

export async function resolveDiscordDestination(userId: string): Promise<
  | { type: "webhook"; webhookUrl: string }
  | { type: "user_id"; discordUserId: string }
  | null
> {
  const row = await prisma.discordIntegration.findUnique({ where: { userId } });
  if (!row) return null;
  if (row.destinationType === "user_id" && row.discordUserId) {
    return { type: "user_id", discordUserId: row.discordUserId };
  }
  if (row.destinationType === "webhook") {
    const webhookUrl = safeDecrypt(row.webhookUrlEnc);
    if (webhookUrl && isDiscordWebhookUrl(webhookUrl)) return { type: "webhook", webhookUrl };
  }
  return null;
}
