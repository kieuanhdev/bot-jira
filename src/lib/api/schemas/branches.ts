import { z } from "zod";

// `jiraKey: null` means "unlink", so it stays distinct from a missing key.
export const BranchLinkBodySchema = z.object({
  action: z.string().optional(),
  jiraKey: z.string().nullable().optional(),
  reason: z.string().optional(),
  ids: z.array(z.string()).optional(),
  replace: z.boolean().optional(),
  syncPr: z.boolean().optional(),
  unlinkJiraKey: z.string().optional(),
});

// `branchIds` and `reviewers` stay unknown: the route keeps only the non-empty strings.
export const BranchPullRequestsBodySchema = z.object({
  jiraKey: z.string().optional(),
  branchIds: z.unknown().optional(),
  targets: z.record(z.string(), z.unknown()).optional(),
  reviewers: z.unknown().optional(),
  dryRun: z.boolean().optional(),
});
