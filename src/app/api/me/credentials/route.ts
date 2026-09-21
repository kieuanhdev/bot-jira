import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { encrypt } from "@/lib/crypto";
import { jiraWith } from "@/lib/jira/client";
import { env, hasJiraConfig } from "@/lib/env";
import { bitbucket as bb } from "@/lib/bitbucket/client";

/** Strip HTML/JSON noise from an upstream error so the UI shows one clean line. */
function cleanError(msg: string): string {
  if (/<html|<title|<!DOCTYPE/i.test(msg)) {
    return "Authentication failed (401) — check the token / auth type";
  }
  const m = msg.match(/->\s*(\d{3})/);
  if (m) return `Jira returned ${m[1]} — check token or permissions`;
  return msg.slice(0, 160);
}

type Body = {
  jiraUser?: string | null;
  jiraToken?: string | null;
  jiraAuth?: "Bearer" | "basic" | null;
  bitbucketUser?: string | null;
  bitbucketToken?: string | null;
  /** When true, remove the stored Jira token (disconnect). */
  disconnectJira?: boolean;
  /** When true, remove the stored Bitbucket token (disconnect). */
  disconnectBitbucket?: boolean;
};

/**
 * Save (or clear) the current user's own Jira & Bitbucket tokens.
 * Tokens are encrypted at rest. After saving we immediately verify each one by
 * calling the API, so the user gets instant feedback that their creds work.
 */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = session.user.id;
  // The session can outlive the User row (e.g. account deleted). Guard against
  // a P2025 by returning 401 so the client re-authenticates instead of 500ing.
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  }
  const body = (await req.json()) as Body;

  const data: {
    jiraUserEnc?: string | null;
    jiraTokenEnc?: string | null;
    jiraAuth?: string | null;
    jiraVerifiedAt?: Date | null;
    bitbucketUserEnc?: string | null;
    bitbucketTokenEnc?: string | null;
    bitbucketVerifiedAt?: Date | null;
    jiraUsername?: string | null;
  } = {};

  // Jira — auto-detect the auth mode this server actually accepts (Bearer vs
  // Basic) so the user doesn't have to guess. Store the working mode.
  const jiraToken = (body.jiraToken ?? "").trim();
  const jiraUser = (body.jiraUser ?? "").trim();
  if (body.disconnectJira) {
    // Explicit disconnect — always clears the stored Jira token.
    data.jiraUserEnc = null;
    data.jiraTokenEnc = null;
    data.jiraAuth = null;
    data.jiraVerifiedAt = null;
    data.jiraUsername = null;
  } else if (jiraToken) {
    data.jiraUserEnc = jiraUser ? encrypt(jiraUser) : null;
    data.jiraTokenEnc = encrypt(jiraToken);
    const { detectJiraAuth } = await import("@/lib/jira/client");
    const detected = await detectJiraAuth(jiraToken, jiraUser);
    data.jiraAuth = detected?.mode ?? (body.jiraAuth ?? "Bearer");
    data.jiraUsername = detected?.name ?? jiraUser ?? null;
  } else {
    // No token provided and no disconnect: keep whatever is already stored
    // (the "leave blank to keep current" behavior).
    data.jiraUserEnc = undefined;
    data.jiraTokenEnc = undefined;
    data.jiraAuth = undefined;
  }

  // Bitbucket
  const bbToken = (body.bitbucketToken ?? "").trim();
  if (body.disconnectBitbucket) {
    data.bitbucketUserEnc = null;
    data.bitbucketTokenEnc = null;
    data.bitbucketVerifiedAt = null;
  } else if (bbToken) {
    data.bitbucketUserEnc = (body.bitbucketUser ?? "").trim()
      ? encrypt(body.bitbucketUser!.trim())
      : null;
    data.bitbucketTokenEnc = encrypt(bbToken);
  } else {
    data.bitbucketUserEnc = undefined;
    data.bitbucketTokenEnc = undefined;
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      jiraUsername: true,
      bitbucketUserEnc: true,
      bitbucketTokenEnc: true,
    },
  });

  // Verify the freshly-saved creds right away.
  const verify = await verifyCreds(user);
  const now = new Date();
  const patch: { jiraVerifiedAt?: Date | null; bitbucketVerifiedAt?: Date | null } = {};
  if (verify.jira.ok) patch.jiraVerifiedAt = now;
  if (verify.bitbucket.ok) patch.bitbucketVerifiedAt = now;
  if (Object.keys(patch).length) await prisma.user.update({ where: { id }, data: patch });

  return NextResponse.json({
    ok: true,
    verify,
    // Never echo tokens back. Report which services are now linked.
    jiraLinked: Boolean(user.jiraTokenEnc),
    bitbucketLinked: Boolean(user.bitbucketTokenEnc),
  });
}

/** Decrypt a user's stored creds and ping each service to confirm they work. */
export async function verifyCreds(user: {
  jiraUserEnc?: string | null;
  jiraTokenEnc?: string | null;
  jiraAuth?: string | null;
  bitbucketUserEnc?: string | null;
  bitbucketTokenEnc?: string | null;
}) {
  const { userJiraAuth, userBitbucketCreds } = await import("@/lib/user-creds");

  const jiraResult: { ok: boolean; detail?: string } = { ok: false };
  const jiraAuth = userJiraAuth(user);
  if (jiraAuth && hasJiraConfig()) {
    try {
      const me = await jiraWith(jiraAuth).me();
      jiraResult.ok = true;
      jiraResult.detail = me.displayName || me.name;
    } catch (e) {
      jiraResult.detail = cleanError((e as Error).message);
    }
  }

  const bbResult: { ok: boolean; detail?: string } = { ok: false };
  const bbCreds = userBitbucketCreds(user);
  const firstRepo = (await import("@/lib/env")).bitbucketRepoList[0];
  if (bbCreds && env.bitbucketBaseUrl && firstRepo) {
    try {
      await bb.listBranches(firstRepo, bbCreds);
      bbResult.ok = true;
      bbResult.detail = firstRepo;
    } catch (e) {
      bbResult.detail = cleanError((e as Error).message);
    }
  }

  return { jira: jiraResult, bitbucket: bbResult };
}
