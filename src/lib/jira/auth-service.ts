import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { encrypt } from "@/lib/crypto";
import { jiraUsernameAliases } from "@/lib/user-creds";
import type { JiraUser } from "./types";
import type { User } from "@prisma/client";

export class IdentityCollisionError extends Error {
  constructor(
    message: string,
    public readonly conflictingUserIds: string[]
  ) {
    super(message);
    this.name = "IdentityCollisionError";
  }
}

/**
 * Compute stable Jira identity key:
 * - Prefer `key:<key>` (Jira Data Center standard).
 * - Fall back to `name:<normalized-name>` if `key` is absent.
 * - Return null if neither is available.
 */
export function computeJiraIdentityKey(user: {
  key?: string | null;
  name?: string | null;
}): string | null {
  if (user.key && user.key.trim()) {
    return `key:${user.key.trim()}`;
  }
  if (user.name && user.name.trim()) {
    return `name:${user.name.trim().toLowerCase()}`;
  }
  return null;
}

export type JiraVerificationSuccess = {
  ok: true;
  mode: "Bearer" | "basic";
  token: string;
  identityKey: string;
  user: JiraUser;
  name?: string;
  key?: string;
  displayName?: string;
  emailAddress?: string;
};

export type JiraVerificationFailure = {
  ok: false;
  code:
    | "server_not_configured"
    | "invalid_input"
    | "invalid_token"
    | "inactive_account"
    | "missing_identity"
    | "timeout"
    | "jira_unavailable";
  message: string;
};

export type JiraVerificationResult = JiraVerificationSuccess | JiraVerificationFailure;

function authHeader(mode: "Bearer" | "basic", token: string, username?: string): string {
  if (mode === "basic") {
    return `Basic ${Buffer.from(`${username ?? ""}:${token}`).toString("base64")}`;
  }
  return `Bearer ${token}`;
}

/**
 * Verify Jira credential via /rest/api/2/myself.
 * Auto-detects Bearer vs Basic if username is provided.
 * Differentiates errors (timeout, invalid token, inactive account, etc.).
 */
export async function verifyJiraCredential(input: {
  token: string;
  username?: string | null;
}): Promise<JiraVerificationResult> {
  const token = input.token.trim();
  const username = input.username?.trim();

  if (!token) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Vui lòng nhập Jira API token.",
    };
  }

  if (!env.jiraBaseUrl) {
    return {
      ok: false,
      code: "server_not_configured",
      message: "Máy chủ chưa cấu hình địa chỉ JIRA_BASE_URL.",
    };
  }

  const base = env.jiraBaseUrl.replace(/\/$/, "");
  const candidates: { mode: "Bearer" | "basic"; user?: string }[] = [
    { mode: "Bearer", user: username },
    ...(username ? [{ mode: "basic" as const, user: username }] : []),
  ];

  let lastStatus: number | null = null;
  let hadTimeout = false;

  for (const candidate of candidates) {
    try {
      const url = `${base}/rest/api/2/myself`;
      console.log(`[JIRA_AUTH] Calling Jira ${candidate.mode} at ${url}...`);
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: authHeader(candidate.mode, token, candidate.user),
        },
        signal: AbortSignal.timeout(env.jiraRequestTimeoutMs || 5000),
      });

      lastStatus = res.status;
      console.log(`[JIRA_AUTH] Jira responded with status ${res.status}`);

      if (res.ok) {
        const me = (await res.json()) as JiraUser;
        console.log(`[JIRA_AUTH] Jira user profile: name=${me.name}, key=${me.key}, email=${me.emailAddress}`);

        // Block inactive Jira account
        if (me.active === false) {
          console.warn("[JIRA_AUTH] Jira account inactive");
          return {
            ok: false,
            code: "inactive_account",
            message: "Tài khoản Jira của bạn đã bị vô hiệu hóa.",
          };
        }

        const identityKey = computeJiraIdentityKey(me);
        if (!identityKey) {
          return {
            ok: false,
            code: "missing_identity",
            message: "Không thể xác định định danh (key/name) từ tài khoản Jira.",
          };
        }

        return {
          ok: true,
          mode: candidate.mode,
          token,
          identityKey,
          user: me,
          name: me.name || me.displayName,
          key: me.key,
          displayName: me.displayName || me.name,
          emailAddress: me.emailAddress,
        };
      }
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        hadTimeout = true;
      }
    }
  }

  if (hadTimeout) {
    return {
      ok: false,
      code: "timeout",
      message: "Kết nối đến máy chủ Jira quá thời gian chờ (timeout). Vui lòng thử lại sau.",
    };
  }

  if (lastStatus === 429 || (lastStatus !== null && lastStatus >= 500)) {
    return {
      ok: false,
      code: "jira_unavailable",
      message: `Máy chủ Jira đang bận hoặc phản hồi lỗi (${lastStatus}). Vui lòng thử lại sau.`,
    };
  }

  return {
    ok: false,
    code: "invalid_token",
    message: "Token Jira không chính xác hoặc không có quyền truy cập.",
  };
}

export type UserResolutionResult = {
  user: User;
  isNew: boolean;
  method: "jiraIdentityKey" | "username_alias" | "email" | "created";
};

/**
 * Resolves a User record from a verified Jira identity.
 * Order of precedence:
 * 1. Match exact `jiraIdentityKey`.
 * 2. Match unique `jiraUsername` / alias.
 * 3. Match unique email only if user has no conflicting jiraIdentityKey.
 * 4. Create new user with role `member`.
 *
 * If collision occurs (>=2 matching existing profiles), throws IdentityCollisionError.
 */
export async function resolveUserFromJiraIdentity(
  identity: {
    identityKey: string;
    key?: string;
    name?: string;
    displayName?: string;
    emailAddress?: string;
  }
): Promise<UserResolutionResult> {
  // 1. Exact match on jiraIdentityKey
  const byKey = await prisma.user.findUnique({
    where: { jiraIdentityKey: identity.identityKey },
  });
  if (byKey) {
    return { user: byKey, isNew: false, method: "jiraIdentityKey" };
  }

  // 2. Match by username / aliases
  const aliases = [
    ...jiraUsernameAliases(identity.name),
    ...(identity.key ? jiraUsernameAliases(identity.key) : []),
  ];

  if (aliases.length > 0) {
    const potentialUsers = await prisma.user.findMany({
      where: {
        OR: [
          { jiraUsername: { in: aliases, mode: "insensitive" } },
          { jiraUserEnc: { not: null } },
        ],
      },
    });

    const matchingCandidates = potentialUsers.filter((u) => {
      // If user is already bound to another Jira account, don't match
      if (u.jiraIdentityKey && u.jiraIdentityKey !== identity.identityKey) {
        return false;
      }
      const rawUser = u.jiraUsername?.toLowerCase();
      if (rawUser && aliases.some((a) => a.toLowerCase() === rawUser)) {
        return true;
      }
      return false;
    });

    if (matchingCandidates.length === 1) {
      return { user: matchingCandidates[0], isNew: false, method: "username_alias" };
    }
    if (matchingCandidates.length > 1) {
      throw new IdentityCollisionError(
        "Phát hiện nhiều tài khoản nội bộ khớp với thông tin Jira này. Vui lòng liên hệ quản trị viên để xử lý.",
        matchingCandidates.map((c) => c.id)
      );
    }
  }

  // 3. Match unique email fallback (migration)
  if (identity.emailAddress) {
    const normEmail = identity.emailAddress.trim().toLowerCase();
    const byEmail = await prisma.user.findUnique({
      where: { email: normEmail },
    });
    if (byEmail && !byEmail.jiraIdentityKey) {
      return { user: byEmail, isNew: false, method: "email" };
    }
  }

  // 4. Create new User with role "member"
  let emailToSet: string | null = null;
  if (identity.emailAddress) {
    const normEmail = identity.emailAddress.trim().toLowerCase();
    const emailConflict = await prisma.user.findUnique({ where: { email: normEmail } });
    if (!emailConflict) {
      emailToSet = normEmail;
    }
  }

  try {
    const newUser = await prisma.user.create({
      data: {
        displayName: identity.displayName || identity.name || identity.key || "Jira User",
        email: emailToSet,
        role: "member",
        jiraUsername: identity.name || identity.key || null,
        jiraIdentityKey: identity.identityKey,
        passwordHash: null,
        onboarded: false,
        boardProjects: [],
      },
    });
    return { user: newUser, isNew: true, method: "created" };
  } catch (err: unknown) {
    // If concurrent request created this user with same jiraIdentityKey
    if ((err as { code?: string })?.code === "P2002") {
      const existing = await prisma.user.findUnique({
        where: { jiraIdentityKey: identity.identityKey },
      });
      if (existing) {
        return { user: existing, isNew: false, method: "jiraIdentityKey" };
      }
    }
    throw err;
  }
}

export function cleanString(val?: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "undefined" || trimmed.toLowerCase() === "null") {
    return null;
  }
  return trimmed;
}

/**
 * Persist verified Jira credentials onto the resolved User.
 */
export async function persistVerifiedJiraCredential(
  userId: string,
  credential: {
    token: string;
    username?: string | null;
    mode: "Bearer" | "basic";
  },
  identity: {
    identityKey: string;
    name?: string;
    key?: string;
    displayName?: string;
  }
): Promise<User> {
  const usernameToStore =
    cleanString(identity.name) ||
    cleanString(credential.username) ||
    cleanString(identity.key) ||
    null;

  return prisma.user.update({
    where: { id: userId },
    data: {
      jiraTokenEnc: encrypt(credential.token),
      jiraUserEnc: usernameToStore ? encrypt(usernameToStore) : null,
      jiraAuth: credential.mode,
      jiraVerifiedAt: new Date(),
      jiraIdentityKey: identity.identityKey,
      jiraUsername: usernameToStore,
      displayName: identity.displayName || undefined,
    },
  });
}

/**
 * High-level orchestration: resolve user and persist verified credential.
 */
export async function resolveAndPersistJiraUser(
  verification: JiraVerificationSuccess,
  rawUsername?: string
): Promise<{ user: User; isNew: boolean }> {
  const resolved = await resolveUserFromJiraIdentity(verification);
  const cleanRaw = cleanString(rawUsername);
  const effectiveUsername = cleanString(verification.name) || cleanRaw || cleanString(verification.key) || null;

  const updatedUser = await persistVerifiedJiraCredential(
    resolved.user.id,
    {
      token: verification.token,
      username: effectiveUsername,
      mode: verification.mode,
    },
    verification
  );

  return { user: updatedUser, isNew: resolved.isNew };
}
