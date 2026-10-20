import { z } from "zod";

// The routes keep their own key-format checks and Vietnamese messages.
export const ProjectKeyBodySchema = z.object({ key: z.string().optional() });

export const ProjectLeadersBodySchema = z.object({ leaderUserIds: z.array(z.unknown()).optional() });

export const ProjectPeopleFieldsBodySchema = z.object({
  fields: z.record(z.string(), z.string().nullable()).optional(),
});

export const JiraSyncBodySchema = z.object({
  projectKey: z.string().optional(),
  full: z.boolean().optional(),
});
