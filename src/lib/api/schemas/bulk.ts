import { z } from "zod";

export const BulkRetryBodySchema = z.object({ itemIds: z.array(z.string()).optional() });

export const BulkRetryBranchBodySchema = z.object({ clientRef: z.string().optional() });

// Loose so the raw body (items, projectKey, defaults...) reaches `previewBulkCreate` untouched.
export const BulkCreateEnvelopeSchema = z.looseObject({
  confirm: z.boolean().optional(),
  operationId: z.string().optional(),
  source: z.unknown().optional(),
});
