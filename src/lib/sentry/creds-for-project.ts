import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { userSentryCreds } from "@/lib/user-creds";
import type { SentryCreds } from "./client";

/**
 * Creds able to read events of one Sentry project.
 *
 * - The server's own SENTRY_ORG/SENTRY_TOKEN when that project is SENTRY_PROJECT.
 * - Otherwise the first user whose stored Sentry token (decrypted the same way
 *   the import worker does) has a mapping for the slug.
 * - `null` when nobody can read it.
 */
export async function sentryCredsForProject(sentryProject: string): Promise<SentryCreds | null> {
  const slug = sentryProject.trim();
  if (!slug) return null;

  if (env.sentryOrg && env.sentryToken && env.sentryProject === slug) {
    return { org: env.sentryOrg, project: slug, token: env.sentryToken };
  }

  let users: { sentryOrg: string | null; sentryMappings: string | null; sentryTokenEnc: string | null }[];
  try {
    users = await prisma.user.findMany({
      where: { sentryTokenEnc: { not: null } },
      select: { sentryOrg: true, sentryMappings: true, sentryTokenEnc: true },
    });
  } catch {
    return null;
  }

  for (const user of users) {
    const creds = userSentryCreds(user);
    if (creds?.mappings.some((m) => m.sentryProject === slug)) {
      return { org: creds.org, project: slug, token: creds.token };
    }
  }
  return null;
}
