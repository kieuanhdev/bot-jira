import { z } from "zod";

// The route checks membership in ROLES itself to keep its "invalid role" message.
export const UserRoleBodySchema = z.object({ role: z.string().optional() });
