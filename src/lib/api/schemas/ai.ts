import { z } from "zod";

// The route validates `idea`/`projectKey` itself (trim, length, Vietnamese messages).
// `current` fields are free-form: the route keeps only non-empty strings.
export const TaskDraftBodySchema = z.object({
  projectKey: z.string().optional(),
  idea: z.string().optional(),
  current: z
    .object({ summary: z.unknown().optional(), description: z.unknown().optional() })
    .nullish(),
});

export const SubtaskSplitBodySchema = z.object({
  projectKey: z.string().optional(),
  parentKey: z.string().optional(),
});
