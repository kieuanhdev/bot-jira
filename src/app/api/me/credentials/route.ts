import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { encrypt } from "@/lib/crypto";
import { jiraWith } from "@/lib/jira/client";
import { env } from "@/lib/env";
import { bitbucket as bb } from "@/lib/bitbucket/client";

/** Strip HTML/JSON noise from an upstream error so the UI shows one clean line. */
function cleanError(msg: string): string {
  if (/<html|<title|<!DOCTYPE/i.test(msg)) {
    return "Authentication failed (401) — check the token / auth type";
  }
  const m = msg.match(/->\s*(\d{3})/);
  if (m) return `Dịch vụ trả về ${m[1]} — hãy kiểm tra token và quyền truy cập`;
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

  const jiraToken = (body.jiraToken ?? "").trim();
  const jiraUser = (body.jiraUser ?? "").trim();
  const bbToken = (body.bitbucketToken ?? "").trim();
  const bbUser = (body.bitbucketUser ?? "").trim();
  const firstRepo = (await import("@/lib/env")).bitbucketRepoList[0];

  // Validate new credentials before persisting them. A failed attempt must not
  // replace a previously working personal credential.
  let verifiedJira: import("@/lib/jira/auth-service").JiraVerificationSuccess | null = null;
  if (jiraToken && !body.disconnectJira) {
    const { verifyJiraCredential } = await import("@/lib/jira/auth-service");
    const res = await verifyJiraCredential({ token: jiraToken, username: jiraUser });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.message },
        { status: 422 }
      );
    }
    verifiedJira = res;
  }

  if (bbToken && !body.disconnectBitbucket) {
    if (!bbUser) {
      return NextResponse.json(
        { ok: false, error: "Username Bitbucket là bắt buộc khi lưu token." },
        { status: 400 }
      );
    }
    if (!env.bitbucketBaseUrl || !firstRepo) {
      return NextResponse.json(
        { ok: false, error: "Máy chủ chưa cấu hình Bitbucket URL hoặc repository để xác minh token." },
        { status: 503 }
      );
    }
    try {
      await bb.listBranches(firstRepo, { user: bbUser, token: bbToken });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: `Không thể xác minh token Bitbucket: ${cleanError((e as Error).message)}` },
        { status: 422 }
      );
    }
  }

  const data: {
    jiraUserEnc?: string | null;
    jiraTokenEnc?: string | null;
    jiraAuth?: string | null;
    jiraVerifiedAt?: Date | null;
    jiraIdentityKey?: string | null;
    bitbucketUserEnc?: string | null;
    bitbucketTokenEnc?: string | null;
    bitbucketVerifiedAt?: Date | null;
    jiraUsername?: string | null;
  } = {};

  // Jira — auto-detect the auth mode this server actually accepts (Bearer vs
  // Basic) so the user doesn't have to guess. Store the working mode.
  if (body.disconnectJira) {
    // Explicit disconnect — always clears the stored Jira token.
    data.jiraUserEnc = null;
    data.jiraTokenEnc = null;
    data.jiraAuth = null;
    data.jiraVerifiedAt = null;
    data.jiraUsername = null;
  } else if (jiraToken && verifiedJira) {
    const { cleanString } = await import("@/lib/jira/auth-service");
    const cleanInputUser = cleanString(jiraUser);
    const resolvedUser = cleanString(verifiedJira.name) || cleanInputUser || "";
    data.jiraUserEnc = resolvedUser ? encrypt(resolvedUser) : null;
    data.jiraTokenEnc = encrypt(jiraToken);
    data.jiraAuth = verifiedJira.mode;
    data.jiraUsername = cleanString(verifiedJira.name) ?? cleanInputUser ?? null;
    data.jiraIdentityKey = verifiedJira.identityKey;
    data.jiraVerifiedAt = new Date();
  } else {
    // No token provided and no disconnect: keep whatever is already stored
    // (the "leave blank to keep current" behavior).
    data.jiraUserEnc = undefined;
    data.jiraTokenEnc = undefined;
    data.jiraAuth = undefined;
  }

  // Bitbucket
  if (body.disconnectBitbucket) {
    data.bitbucketUserEnc = null;
    data.bitbucketTokenEnc = null;
    data.bitbucketVerifiedAt = null;
  } else if (bbToken) {
    data.bitbucketUserEnc = encrypt(bbUser);
    data.bitbucketTokenEnc = encrypt(bbToken);
    data.bitbucketVerifiedAt = new Date();
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
  if (jiraAuth && env.jiraBaseUrl) {
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
