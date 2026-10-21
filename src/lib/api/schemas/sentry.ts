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

export const SENTRY_SORT_OPTIONS = ["recent", "events", "first", "hot"] as const;
export type SentrySortOption = (typeof SENTRY_SORT_OPTIONS)[number];

export const SentryQuerySchema = z.object({
  q: z
    .string()
    .max(100)
    .transform((v) => v.trim())
    .transform((v) => (v.length > 0 ? v : undefined))
    .optional()
    .catch(undefined),
  sort: z
    .enum(SENTRY_SORT_OPTIONS)
    .optional()
    .catch(undefined),
});

