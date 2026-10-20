import { z } from "zod";

export const BoardProjectsBodySchema = z.object({ projects: z.array(z.string()).optional() });

// `boardId` is coerced so a numeric string still works. The route checks the key format.
const BoardIdSchema = z.coerce.number().int().positive();

export const BoardPreferenceBodySchema = z.object({
  projectKey: z.string().optional(),
  boardId: BoardIdSchema.optional(),
});

export const BoardMembershipRefreshBodySchema = z.object({
  projectKey: z.string().optional(),
  boardId: BoardIdSchema.optional(),
  reason: z.string().optional(),
  force: z.boolean().optional(),
});

export const CredentialsBodySchema = z.object({
  jiraUser: z.string().nullable().optional(),
  jiraToken: z.string().nullable().optional(),
  jiraAuth: z.enum(["Bearer", "basic"]).nullable().optional(),
  bitbucketUser: z.string().nullable().optional(),
  bitbucketToken: z.string().nullable().optional(),
  disconnectJira: z.boolean().optional(),
  disconnectBitbucket: z.boolean().optional(),
  sentryOrg: z.string().nullable().optional(),
  sentryMappings: z.string().nullable().optional(),
  sentryToken: z.string().nullable().optional(),
  disconnectSentry: z.boolean().optional(),
});
