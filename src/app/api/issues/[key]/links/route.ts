import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { IssueLinkBodySchema } from "@/lib/api/schemas";
import { jiraWith } from "@/lib/jira/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import { audit } from "@/lib/audit";
import { describeLinkTo } from "@/lib/issues/clone";

export const dynamic = "force-dynamic";

const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/;

async function clientForSession(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  return userJiraAuth(user);
}

/** The issue link types this Jira instance offers, for the "Liên kết task" picker. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const auth = await clientForSession(session.user.id);
  if (!auth) return jiraCredentialsRequired();

  try {
    const res = await jiraWith(auth).getIssueLinkTypes();
    const items = (res?.issueLinkTypes ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      inward: t.inward,
      outward: t.outward,
    }));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: `Không đọc được danh sách loại liên kết: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}

/**
 * Link this issue to another one, Jira-style.
 *
 * `direction` is the phrase the user picked:
 * - `outward` → reads "<key> {type.outward} <targetKey>"
 * - `inward`  → reads "<key> {type.inward} <targetKey>"
 *
 * `createIssueLink(type, inwardKey, outwardKey)` renders as
 * `inwardKey {type.outward} outwardKey`, so the inward phrase swaps the pair.
 */
export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { key: rawKey } = await ctx.params;
  const key = rawKey?.trim().toUpperCase() ?? "";

  const parsedBody = await readJsonBody(req, IssueLinkBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const typeName = body.typeName?.trim();
  const direction = body.direction === "inward" ? "inward" : "outward";
  const targetKey = body.targetKey?.trim().toUpperCase() ?? "";

  if (!typeName) {
    return NextResponse.json({ error: "Chưa chọn loại liên kết." }, { status: 400 });
  }
  if (!JIRA_KEY_RE.test(targetKey)) {
    return NextResponse.json(
      { error: "Mã task liên kết không hợp lệ (ví dụ: EPM-123)." },
      { status: 400 }
    );
  }
  if (targetKey === key) {
    return NextResponse.json({ error: "Không thể liên kết task với chính nó." }, { status: 400 });
  }

  const auth = await clientForSession(session.user.id);
  if (!auth) return jiraCredentialsRequired();
  const client = jiraWith(auth);

  try {
    if (direction === "outward") {
      await client.createIssueLink(typeName, key, targetKey);
    } else {
      await client.createIssueLink(typeName, targetKey, key);
    }
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: "Bạn không có quyền tạo liên kết cho task này." },
        { status: 403 }
      );
    }
    if (status === 404) {
      return NextResponse.json(
        { error: `Không tìm thấy task ${targetKey} trên Jira.` },
        { status: 404 }
      );
    }

    // Jira answers this POST with an empty body, so a transport-level failure
    // does not prove the link is missing. Read it back before reporting an
    // error: a retry on a link Jira already stored would duplicate it.
    const landed = await client
      .getIssue(key, "issuelinks")
      .then((issue) => describeLinkTo(issue.fields?.issuelinks, targetKey))
      .catch(() => null);
    if (!landed) {
      return NextResponse.json(
        { error: `Không tạo được liên kết: ${(e as Error).message}` },
        { status: 502 }
      );
    }
  }

  await audit({
    actorId: session.user.id,
    actorEmail: session.user.email ?? null,
    action: "issue.link.create",
    target: key,
    after: { typeName, direction, targetKey },
  });

  // Both sides change: refresh each so the relations panel shows the new link
  // before the next background sync.
  await Promise.all([
    refreshJiraIssueCache(client, key, { excludeUserId: session.user.id }).catch(() => false),
    refreshJiraIssueCache(client, targetKey, { excludeUserId: session.user.id }).catch(() => false),
  ]);

  return NextResponse.json({ ok: true, typeName, direction, targetKey });
}
