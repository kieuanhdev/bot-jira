import { z } from "zod";

export const PushSubscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://"),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// `subscription` is checked against PushSubscriptionSchema by the route so it
// can answer "subscription required" and store the raw browser object.
export const PushSubscribeBodySchema = z.object({
  subscription: z.unknown().optional(),
  unsubscribe: z.boolean().optional(),
});
