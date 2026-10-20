import { z } from "zod";

// Fields stay optional so the routes keep their own "required" messages.
export const IssueCommentBodySchema = z.object({ body: z.string().optional() });

export const IssueTransitionBodySchema = z.object({ transitionId: z.string().optional() });
