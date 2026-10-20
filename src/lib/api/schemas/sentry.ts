import { z } from "zod";

const MAX_REVIEW_IDS = 100;

// Loose so `row` and any other field reach the route untouched.
export const SentryCreateBodySchema = z.looseObject({
  row: z.unknown().optional(),
  confirm: z.boolean().optional(),
  operationId: z.string().optional(),
});

// Non-string and empty ids are dropped and the list is capped, as the route always did.
export const SentryReviewBodySchema = z.object({
  ids: z
    .unknown()
    .transform((v) =>
      Array.isArray(v)
        ? v.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, MAX_REVIEW_IDS)
        : []
    ),
  decision: z.unknown().optional(),
});

export const SentryRetryBodySchema = z.object({ id: z.string().optional() });

export const SentryBulkCreateBodySchema = z.looseObject({
  ids: z.unknown().optional(),
  confirm: z.boolean().optional(),
  operationId: z.string().optional(),
});
