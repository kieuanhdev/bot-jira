import { z } from "zod";

export const OutboxRetryBodySchema = z.object({ ids: z.array(z.string()).optional() });

// `preset`, `features` and `keys` stay unknown: the route validates them with its own messages.
export const AdminProjectSyncBodySchema = z.object({
  syncEnabled: z.boolean().optional(),
  keys: z.unknown().optional(),
  preset: z.unknown().optional(),
  features: z.unknown().optional(),
});

export const ReportSnapshotBodySchema = z.object({
  projectKey: z.string().optional(),
  targetDate: z.string().optional(),
  timezone: z.string().optional(),
});
