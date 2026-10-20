import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { IssueChildBodySchema } from "@/lib/api/schemas";
import { jiraWith } from "@/lib/jira/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import { createScreenFields } from "@/lib/issues/clone";
import { allowedChildTypes, childMode, type ChildMode, type ChildTypeOption } from "@/lib/issues/children";
import type { JiraCreateMetaIssueType } from "@/lib/jira/types";

export const dynamic = "force-dynamic";

const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/;
const MAX_SUMMARY_LENGTH = 255;
// System fields a create screen always fills for us, plus the ones we send.
const FILLED_FIELDS = new Set(["project", "issuetype", "summary", "parent", "reporter"]);

type RouteContext = { params: Promise<{ key: string }> };

function jiraStatus(error: unknown): number | null {
  const status = (error as { status?: number })?.status;
  return typeof status === "number" ? status : null;
}

function jiraDetail(error: unknown): string {
  const e = error as { errorDetails?: string | null; message?: string };
  return e.errorDetails || e.message || "Lỗi không xác định";
}

/** Auth + parent lookup shared by GET and POST. Returns a response on failure. */
async function loadParent(ctx: RouteContext) {
  const session = await getSession();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };

  const key = (await ctx.params).key?.trim().toUpperCase() ?? "";
  if (!JIRA_KEY_RE.test(key)) {
    return { error: NextResponse.json({ error: "Mã task không hợp lệ." }, { status: 400 }) };
  }

  // Creating issues only ever runs with the user's own Jira token.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user);
  if (!auth) return { error: jiraCredentialsRequired() };
  const client = jiraWith(auth);

  try {
    const parent = await client.getIssue(key);
    const projectKey = parent.fields?.project?.key ?? key.split("-")[0];
    const mode = childMode(parent.fields?.issuetype as { name?: string; subtask?: boolean } | undefined);
    const meta = mode === "none" ? null : await client.getCreateMetadata(projectKey).catch(() => null);
    const types: JiraCreateMetaIssueType[] =
      meta?.projects?.find((p) => p.key?.toUpperCase() === projectKey.toUpperCase())?.issuetypes ?? [];
    return { key, session, client, projectKey, mode, types };
  } catch (e) {
    const status = jiraStatus(e);
    if (status === 401 || status === 403) {
      return { error: NextResponse.json({ error: "Bạn không có quyền xem task này." }, { status: 403 }) };
    }
    if (status === 404) {
      return { error: NextResponse.json({ error: `Không tìm thấy task ${key}.` }, { status: 404 }) };
    }
    return { error: NextResponse.json({ error: `Lỗi Jira: ${jiraDetail(e)}` }, { status: 502 }) };
  }
}

/** What a new child of this issue can be: how it attaches and which types are offered. */
export async function GET(_req: Request, ctx: RouteContext) {
  const loaded = await loadParent(ctx);
  if ("error" in loaded && loaded.error) return loaded.error;
  const { mode, types } = loaded as { mode: ChildMode; types: JiraCreateMetaIssueType[] };
  return NextResponse.json({ mode, types: allowedChildTypes(mode, types) satisfies ChildTypeOption[] });
}

/** Create a sub-task (or a task inside an Epic) under this issue. */
export async function POST(req: Request, ctx: RouteContext) {
  const loaded = await loadParent(ctx);
  if ("error" in loaded && loaded.error) return loaded.error;
  const { key, session, client, projectKey, mode, types } = loaded as Exclude<typeof loaded, { error: unknown }>;

  const parsedBody = await readJsonBody(req, IssueChildBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const summary = body.summary?.trim() ?? "";
  if (!summary) return NextResponse.json({ error: "Chưa nhập tiêu đề." }, { status: 400 });
  if (summary.length > MAX_SUMMARY_LENGTH) {
    return NextResponse.json({ error: `Tiêu đề tối đa ${MAX_SUMMARY_LENGTH} ký tự.` }, { status: 400 });
  }
  if (mode === "none") {
    return NextResponse.json({ error: "Sub-task không thể có task con." }, { status: 400 });
  }

  // createIssue falls back to "Bug" when no type id is given, so the id must be vetted.
  const allowed = allowedChildTypes(mode, types);
  const issueTypeId = body.issueTypeId ?? "";
  if (!allowed.some((t) => t.id === issueTypeId)) {
    return NextResponse.json({ error: "Loại task không hợp lệ cho task cha này." }, { status: 400 });
  }

  // Fail early, with names, when the create screen demands fields we cannot fill.
  const typeMeta = types.find((t) => t.id === issueTypeId);
  const { required } = createScreenFields(typeMeta?.fields);
  const unfillable = required.filter((id) => !FILLED_FIELDS.has(id));
  if (unfillable.length > 0) {
    const names = unfillable.map((id) => typeMeta?.fields?.[id]?.name ?? id).join(", ");
    return NextResponse.json(
      { error: `Loại task này bắt buộc nhập thêm: ${names}. Hãy tạo trực tiếp trên Jira.` },
      { status: 400 }
    );
  }

  let created;
  try {
    created = await client.createIssue({
      projectKey,
      issueTypeId,
      summary,
      ...(mode === "subtask" ? { fields: { parent: { key } } } : {}),
    });
  } catch (e) {
    const status = jiraStatus(e);
    if (status === 401 || status === 403) {
      return NextResponse.json({ error: "Bạn không có quyền tạo task trong project này." }, { status: 403 });
    }
    return NextResponse.json({ error: `Không tạo được task: ${jiraDetail(e)}` }, { status: 502 });
  }

  // The issue exists from here on. A failed epic link is reported, never thrown:
  // a retry would create a second issue.
  let linkError: string | null = null;
  if (mode === "epic") {
    try {
      await client.updateIssue(created.key, { epic: key });
    } catch (e) {
      linkError = jiraDetail(e);
    }
  }

  // Both sides go into the cache: subtasks surface through the parent's payload,
  // epic children only through the cached epic key.
  await Promise.all([
    refreshJiraIssueCache(client, created.key, { excludeUserId: session.user.id }),
    refreshJiraIssueCache(client, key, { excludeUserId: session.user.id }),
  ]);

  return NextResponse.json({ ok: true, key: created.key, summary, mode, linkError });
}
