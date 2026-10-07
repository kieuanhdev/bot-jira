import type { Prisma } from "@prisma/client";
import { jiraUsernameAliases } from "@/lib/user-creds";

export type PeopleField = "assigneeJira" | "reporterJira" | "approverJira" | "testerJira";

/** Build a reusable person facet condition with `me`, aliases and unassigned support. */
export function peopleFilterCondition(
  field: PeopleField,
  tokens: string[],
  currentUsername: string | null
): Prisma.IssueCacheWhereInput | null {
  if (tokens.length === 0 || tokens.some((token) => token.toLowerCase() === "all")) return null;

  const hasUnassigned = tokens.some((token) => {
    const value = token.toLowerCase();
    return value === "unassigned" || value === "none";
  });
  const aliases = Array.from(new Set(tokens
    .filter((token) => !["unassigned", "none"].includes(token.toLowerCase()))
    .flatMap((token) => jiraUsernameAliases(token.toLowerCase() === "me" ? currentUsername : token))));

  const choices: Prisma.IssueCacheWhereInput[] = [];
  if (aliases.length > 0) choices.push({ [field]: { in: aliases } });
  if (hasUnassigned) choices.push({ [field]: null });
  if (choices.length === 0) return { [field]: "__unresolved_current_user__" };
  return choices.length === 1 ? choices[0] : { OR: choices };
}
