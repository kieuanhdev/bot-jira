import { z } from "zod";

export const ReleaseMetadataBodySchema = z.object({
  notes: z.string().optional(),
  description: z.string().optional(),
});

// `type` stays a plain string: the route rejects unknown values with its own message.
export const ReleaseApprovalBodySchema = z.object({
  type: z.string().optional(),
  note: z.string().optional(),
});

export const ReleaseOverrideBodySchema = z.object({
  gate: z.string().optional(),
  reason: z.string().optional(),
  expiresAt: z.string().optional(),
});

// A missing `version` becomes "" so `createReleaseWithJira` keeps answering "version required".
export const CreateReleaseBodySchema = z.object({
  projectKey: z.string().optional(),
  jiraVersionId: z.string().optional(),
  version: z.string().default(""),
  description: z.string().optional(),
  targetLabel: z.string().optional(),
  notes: z.string().optional(),
});
