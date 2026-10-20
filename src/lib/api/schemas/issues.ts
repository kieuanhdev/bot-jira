import { z } from "zod";

// Fields stay optional so the routes keep their own "required" messages.
export const IssueCommentBodySchema = z.object({ body: z.string().optional() });

export const IssueTransitionBodySchema = z.object({ transitionId: z.string().optional() });

// Only the confirm envelope is checked here. The body is looser than the schema on
// purpose: the raw body goes on to `validateBulkRequest`, which owns `selector`/`action`.
export const BulkConfirmEnvelopeSchema = z.looseObject({
  confirm: z.boolean().optional(),
  operationId: z.string().optional(),
});

export const IssueLinkBodySchema = z.object({
  typeName: z.string().optional(),
  direction: z.string().optional(),
  targetKey: z.string().optional(),
});

export const IssueChildBodySchema = z.object({
  summary: z.string().optional(),
  issueTypeId: z.string().optional(),
});

export const IssueCloneBodySchema = z.object({ summary: z.string().optional() });

export const EstimateDecisionBodySchema = z.object({
  decision: z.enum(["accepted", "edited", "rejected"]).optional(),
  points: z.number().nullable().optional(),
});

export const BranchParamsBodySchema = z.object({
  repo: z.string().optional(),
  base: z.string().optional(),
  nameTemplate: z.string().optional(),
  comment: z.boolean().optional(),
});

const nullableString = z.string().nullable().optional();

export const IssuePatchBodySchema = z.object({
  summary: z.string().optional(),
  description: z.string().optional(),
  assignee: nullableString,
  labels: z.array(z.string()).optional(),
  priority: z.string().optional(),
  points: z.number().nullable().optional(),
  fixVersions: z.array(z.string()).optional(),
  addFixVersion: z.string().optional(),
  removeFixVersion: z.string().optional(),
  addLabel: z.string().optional(),
  removeLabel: z.string().optional(),
  issueType: z.string().optional(),
  dueDate: nullableString,
  epic: nullableString,
  reporter: nullableString,
  approver: nullableString,
  tester: nullableString,
});
