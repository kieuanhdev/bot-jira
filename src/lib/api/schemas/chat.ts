import { z } from "zod";

export const ChatLinkBodySchema = z.object({
  provider: z.string().optional(),
  externalId: z.string().optional(),
  displayName: z.string().optional(),
});

export const ChatUnlinkBodySchema = z.object({ provider: z.string().optional() });

const DiscordDestinationFields = {
  discordUserId: z.string().optional(),
  webhookUrl: z.string().optional(),
};

// A bad `destinationType` fails with path "destinationType"; the route maps that to its own message.
export const DiscordIntegrationBodySchema = z.discriminatedUnion("destinationType", [
  z.object({ destinationType: z.literal("webhook"), ...DiscordDestinationFields }),
  z.object({ destinationType: z.literal("user_id"), ...DiscordDestinationFields }),
]);
