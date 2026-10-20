import { z } from "zod";

export const NotifyDeleteBodySchema = z.object({
  ids: z.array(z.string()).optional(),
  allRead: z.boolean().optional(),
  all: z.boolean().optional(),
});

export const NotifyMarkReadBodySchema = z.object({
  ids: z.array(z.string()).optional(),
  all: z.boolean().optional(),
  before: z.string().optional(),
  unread: z.boolean().optional(),
});

// Type names are checked against KNOWN_TYPES by the route, which names the unknown ones.
export const NotifyPreferencesBodySchema = z.object({
  disabledTypes: z.array(z.string()).optional(),
  broadcastEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  pushDisabledTypes: z.array(z.string()).optional(),
  deliveryMode: z.enum(["digest", "instant"]).optional(),
  digestHour: z.number().finite().optional(),
});
