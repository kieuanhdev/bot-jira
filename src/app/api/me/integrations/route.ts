import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { env, hasJiraConfig, hasBitbucketConfig } from "@/lib/env";
import { userJiraAuth, userBitbucketCreds } from "@/lib/user-creds";
import { jiraWith } from "@/lib/jira/client";
import { bitbucket as bb } from "@/lib/bitbucket/client";
import { bitbucketRepoList } from "@/lib/env";

/**
 * Current user's integration status: which services are linked with their own
 * token, and whether those tokens currently work. Never returns the tokens.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      jiraUsername: true,
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      bitbucketUserEnc: true,
      bitbucketTokenEnc: true,
      jiraVerifiedAt: true,
      bitbucketVerifiedAt: true,
    },
  });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  const jiraLinked = Boolean(user.jiraTokenEnc);
  const bbLinked = Boolean(user.bitbucketTokenEnc);

  // Live-verify (best-effort, short). Only if the service is reachable/configured.
  const clean = (m: string) =>
    /<html|<title|<!DOCTYPE/i.test(m)
      ? "Authentication failed (401) — check the token / auth type"
      : m.slice(0, 160);

  let jiraStatus: { ok: boolean; detail?: string } = { ok: false };
  if (jiraLinked && hasJiraConfig()) {
    try {
      const me = await jiraWith(userJiraAuth(user)).me();
      jiraStatus = { ok: true, detail: me.displayName || me.name };
    } catch (e) {
      jiraStatus = { ok: false, detail: clean((e as Error).message) };
    }
  }
  let bbStatus: { ok: boolean; detail?: string } = { ok: false };
  if (bbLinked && env.bitbucketBaseUrl && bitbucketRepoList[0]) {
    try {
      await bb.listBranches(bitbucketRepoList[0], userBitbucketCreds(user));
      bbStatus = { ok: true, detail: bitbucketRepoList[0] };
    } catch (e) {
      bbStatus = { ok: false, detail: clean((e as Error).message) };
    }
  }

  return NextResponse.json({
    jira: { linked: jiraLinked, status: jiraStatus, verifiedAt: user.jiraVerifiedAt },
    bitbucket: { linked: bbLinked, status: bbStatus, verifiedAt: user.bitbucketVerifiedAt },
    // Shared fallbacks exist even if the user hasn't linked their own.
    sharedJira: hasJiraConfig(),
    sharedBitbucket: hasBitbucketConfig(),
    bitbucketRepo: bitbucketRepoList[0] ?? null,
  });
}
