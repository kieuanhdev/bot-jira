import { z } from "zod";

// Fields stay optional so the route keeps its own "required" and length messages.
export const RegisterBodySchema = z.object({
  displayName: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
});
