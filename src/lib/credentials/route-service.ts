import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { CredentialsBodySchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { encrypt } from "@/lib/crypto";
import { jiraWith } from "@/lib/jira/client";
import { env } from "@/lib/env";
import { bitbucket as bb } from "@/lib/bitbucket/client";
import { clearBitbucketCredsCache } from "@/lib/bitbucket/transport";

/** Strip HTML/JSON noise from an upstream error so the UI shows one clean line. */
function cleanError(msg: string): string {
  if (/<html|<title|<!DOCTYPE/i.test(msg)) {
    return "Authentication failed (401) — check the token / auth type";
  }
  const m = msg.match(/->\s*(\d{3})/);
  if (m) return `Dịch vụ trả về ${m[1]} — hãy kiểm tra token và quyền truy cập`;
  return msg.slice(0, 160);
}

/**
 * Validate a user's Sentry config before it is persisted: every mapped Jira key
 * must be a catalog project (issues are filed with the system Jira account, so
 * this stops a user routing tasks anywhere), and the token must be able to read
 * each Sentry project. Returns an error message, or null when valid.
 */
async function validateSentryConfig(input: {
  org: string;
  mappings: string;
  token: string;
}): Promise<string | null> {
  const { parseSentryMappings, invalidSentryMappings } = await import("@/lib/sentry/mapping");
  if (invalidSentryMappings(input.mappings).length > 0) {
    return "Định dạng dự án Sentry không hợp lệ. Dùng: slug-sentry:KEYJIRA, cách nhau bởi dấu phẩy.";
  }
  const pairs = parseSentryMappings(input.mappings);
  if (pairs.length === 0) return "Cần ít nhất một cặp slug-sentry:KEYJIRA.";
  if (pairs.length > 10) return "Tối đa 10 dự án Sentry cho mỗi người dùng.";

  const { isCatalogProject } = await import("@/lib/jira/project-catalog");
  for (const pair of pairs) {
    if (!(await isCatalogProject(pair.jiraProject))) {
      return `Project Jira "${pair.jiraProject}" chưa có trong danh mục của hệ thống.`;
    }
  }

  const { sentryWith } = await import("@/lib/sentry/client");
  for (const pair of pairs) {
    try {
      await sentryWith({ org: input.org, project: pair.sentryProject, token: input.token })
        .listUnresolvedIssues(1);
    } catch (e) {
      return `Không đọc được dự án Sentry "${pair.sentryProject}": ${cleanError((e as Error).message)}`;
    }
  }
  return null;
}

/**
 * Save (or clear) the current user's own Jira & Bitbucket tokens.
 * Tokens are encrypted at rest. After saving we immediately verify each one by
 * calling the API, so the user gets instant feedback that their creds work.
 */
export async function handleCredentialsUpdateRequest(req: Request) {
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
  const parsedBody = await readJsonBody(req, CredentialsBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  const jiraToken = (body.jiraToken ?? "").trim();
  const jiraUser = (body.jiraUser ?? "").trim();
  const bbToken = (body.bitbucketToken ?? "").trim();
  const bbUser = (body.bitbucketUser ?? "").trim();
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
    if (!env.bitbucketBaseUrl) {
      return NextResponse.json(
        { ok: false, error: "Máy chủ chưa cấu hình Bitbucket URL để xác minh token." },
        { status: 503 }
      );
    }
    try {
      await bb.verifyCreds({ user: bbUser, token: bbToken });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: `Không thể xác minh token Bitbucket: ${cleanError((e as Error).message)}` },
        { status: 422 }
      );
    }
  }

  // Sentry: validate before persisting; a failed attempt keeps the old config.
  const sentryToken = (body.sentryToken ?? "").trim();
  const sentryOrg = (body.sentryOrg ?? "").trim();
  const sentryMappings = (body.sentryMappings ?? "").trim();
  const touchesSentry = !body.disconnectSentry && Boolean(sentryToken || sentryOrg || sentryMappings);
  let sentryTokenToStore: string | null = null;
  if (touchesSentry) {
    const stored = await prisma.user.findUnique({ where: { id }, select: { sentryTokenEnc: true } });
    const { safeDecrypt } = await import("@/lib/crypto");
    const token = sentryToken || safeDecrypt(stored?.sentryTokenEnc) || "";
    if (!sentryOrg || !sentryMappings || !token) {
      return NextResponse.json(
        { ok: false, error: "Sentry cần đủ: organization, danh sách dự án và token." },
        { status: 400 }
      );
    }
    const problem = await validateSentryConfig({ org: sentryOrg, mappings: sentryMappings, token });
    if (problem) {
      return NextResponse.json({ ok: false, error: problem }, { status: 422 });
    }
    sentryTokenToStore = token;
  }

  const data: {
    sentryOrg?: string | null;
    sentryMappings?: string | null;
    sentryTokenEnc?: string | null;
    sentryVerifiedAt?: Date | null;
    sentryLastError?: string | null;
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

  // Sentry
  if (body.disconnectSentry) {
    data.sentryOrg = null;
    data.sentryMappings = null;
    data.sentryTokenEnc = null;
    data.sentryVerifiedAt = null;
    data.sentryLastError = null;
  } else if (sentryTokenToStore) {
    data.sentryOrg = sentryOrg;
    data.sentryMappings = sentryMappings;
    data.sentryTokenEnc = encrypt(sentryTokenToStore);
    data.sentryVerifiedAt = new Date();
    data.sentryLastError = null;
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
      sentryTokenEnc: true,
    },
  });

  if (body.disconnectBitbucket || bbToken) {
    clearBitbucketCredsCache();
  }

  // Verify the freshly-saved creds right away.
  const verify = await verifyCreds(user);
  const now = new Date();
  const patch: { jiraVerifiedAt?: Date | null; bitbucketVerifiedAt?: Date | null } = {};
  if (verify.jira.ok) patch.jiraVerifiedAt = now;
  if (verify.bitbucket.ok) patch.bitbucketVerifiedAt = now;
  if (Object.keys(patch).length) await prisma.user.update({ where: { id }, data: patch });

  // Best-effort: a freshly saved token may unlock repos/projects nobody could
  // read before. Look them up and start syncing right away. Never fails the save.
  const discovery = await runOnboarding(user, {
    bitbucket: Boolean(bbToken) && !body.disconnectBitbucket && verify.bitbucket.ok,
    jira: Boolean(jiraToken) && !body.disconnectJira && verify.jira.ok,
  });

  return NextResponse.json({
    ok: true,
    verify,
    discovery,
    // Never echo tokens back. Report which services are now linked.
    jiraLinked: Boolean(user.jiraTokenEnc),
    bitbucketLinked: Boolean(user.bitbucketTokenEnc),
    sentryLinked: Boolean(user.sentryTokenEnc),
  });
}

type Discovery = {
  bitbucket?: { readable: number; newRepos: string[] };
  jira?: { readable: number; registered: string[] };
};

async function runOnboarding(
  user: Parameters<typeof verifyCreds>[0],
  which: { bitbucket: boolean; jira: boolean }
): Promise<Discovery> {
  const { userJiraAuth, userBitbucketCreds } = await import("@/lib/user-creds");
  const out: Discovery = {};
  let syncBranches = false;
  let syncJira = false;

  const bbCreds = which.bitbucket ? userBitbucketCreds(user) : null;
  if (bbCreds) {
    try {
      const { onboardBitbucketToken } = await import("@/lib/bitbucket/token-onboarding");
      out.bitbucket = await onboardBitbucketToken(bbCreds);
      syncBranches = out.bitbucket.newRepos.length > 0;
    } catch (e) {
      console.warn("Bitbucket token onboarding failed:", (e as Error).message);
    }
  }

  const jiraAuth = which.jira ? userJiraAuth(user) : null;
  if (jiraAuth) {
    try {
      const { onboardJiraToken } = await import("@/lib/jira/token-onboarding");
      out.jira = await onboardJiraToken(jiraAuth);
      syncJira = out.jira.registered.length > 0;
    } catch (e) {
      console.warn("Jira token onboarding failed:", (e as Error).message);
    }
  }

  try {
    const { enqueueCheckBranches, enqueueJiraDispatch } = await import("@/lib/queue/boss");
    if (syncBranches) await enqueueCheckBranches();
    if (syncJira) await enqueueJiraDispatch({ source: "admin" });
  } catch (e) {
    console.warn("Could not enqueue sync after token save:", (e as Error).message);
  }
  return out;
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
  if (bbCreds && env.bitbucketBaseUrl) {
    try {
      await bb.verifyCreds(bbCreds);
      bbResult.ok = true;
      bbResult.detail = bbCreds.user;
    } catch (e) {
      bbResult.detail = cleanError((e as Error).message);
    }
  }

  return { jira: jiraResult, bitbucket: bbResult };
}
