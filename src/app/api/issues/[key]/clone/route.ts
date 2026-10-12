import { NextResponse } from "next/server";
import { jiraPointsFromFields, jiraWith } from "@/lib/jira/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userJiraAuth } from "@/lib/user-creds";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";
import { getEpicLinkFieldIds } from "@/lib/issues/epic";
import { getProjectPeopleFields } from "@/lib/jira/people-fields";
import {
  buildCloneFields,
  createScreenFields,
  describeLinkTo,
  resolveCloneLinkType,
} from "@/lib/issues/clone";
import type { JiraIssue } from "@/lib/jira/types";

const MAX_SUMMARY_LENGTH = 255;

function jiraStatus(error: unknown): number | null {
  const status = (error as { status?: number })?.status;
  return typeof status === "number" ? status : null;
}

/** Project-specific field ids worth copying on top of the system fields. */
async function extraCloneFieldIds(projectKey: string, source: JiraIssue): Promise<string[]> {
  const people = await getProjectPeopleFields(projectKey).catch(() => null);
  const { fieldId: pointsFieldId } = jiraPointsFromFields(source.fields);
  return [
    ...Object.values(people ?? {}).filter((value): value is string => Boolean(value)),
    ...getEpicLinkFieldIds(),
    ...(pointsFieldId ? [pointsFieldId] : []),
  ];
}

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { key } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { summary?: string };
  const requestedSummary = body.summary?.trim();
  if (requestedSummary && requestedSummary.length > MAX_SUMMARY_LENGTH) {
    return NextResponse.json(
      { error: `Tiêu đề tối đa ${MAX_SUMMARY_LENGTH} ký tự.` },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user);
  if (!auth) return jiraCredentialsRequired();
  const client = jiraWith(auth);

  // Read every navigable field: the copy is built from Jira's raw payload, not
  // from the local read model, so wiki markup and custom fields survive.
  let source: JiraIssue;
  try {
    await client.getFields().catch(() => null); // learn the story points field ids
    source = await client.getIssue(key);
  } catch (e) {
    const status = jiraStatus(e);
    if (status === 401 || status === 403) {
      return NextResponse.json({ error: "Bạn không có quyền xem task này.", code: "permission" }, { status: 403 });
    }
    if (status === 404) {
      return NextResponse.json({ error: `Không tìm thấy task ${key}.` }, { status: 404 });
    }
    return NextResponse.json({ error: `Lỗi Jira: ${(e as Error).message}`, code: "upstream" }, { status: 502 });
  }

  const projectKey = source.fields?.project?.key ?? key.split("-")[0] ?? "";
  const issueTypeId = source.fields?.issuetype?.id ?? "";
  if (!projectKey || !issueTypeId) {
    return NextResponse.json(
      { error: "Jira không trả về project hoặc issue type của task nguồn." },
      { status: 502 }
    );
  }

  // Only fields on the target create screen may be sent; anything else is a 400.
  // `getCreateMetadata` is the call bulk create already relies on: it falls back
  // to the per-issue-type endpoint on the Jira versions that 404 the legacy one.
  const meta = await client.getCreateMetadata(projectKey, issueTypeId).catch(() => null);
  const screen = createScreenFields(
    meta?.projects
      ?.find((project) => project.key?.toUpperCase() === projectKey.toUpperCase())
      ?.issuetypes?.find((type) => type.id === issueTypeId)?.fields
  );
  const clone = buildCloneFields(source, {
    summary: requestedSummary,
    extraFieldIds: await extraCloneFieldIds(projectKey, source),
    allowedFieldIds: screen.allowed,
    requiredFieldIds: screen.required,
  });

  let created;
  try {
    created = await client.createIssue({
      projectKey: clone.projectKey,
      issueTypeId: clone.issueTypeId,
      summary: clone.summary,
      fields: clone.fields,
    });
  } catch (e) {
    const status = jiraStatus(e);
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: "Bạn không có quyền tạo task trong project này.", code: "permission" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: `Không tạo được bản sao: ${(e as Error).message}`, code: "upstream" },
      { status: 502 }
    );
  }

  // The issue exists from here on. A failed link is reported, never thrown:
  // a retry would create a second copy.
  let linkError: string | null = null;
  try {
    const types = await client.getIssueLinkTypes();
    const linkType = resolveCloneLinkType(types?.issueLinkTypes);
    if (!linkType) {
      linkError = "Jira không có loại liên kết nào dùng được cho bản sao.";
    } else {
      await client.createIssueLink(linkType.name, created.key, key);
    }
  } catch (e) {
    linkError = (e as Error).message;
  }

  // Read the relation back instead of assuming the direction Jira stored.
  const relation = await client
    .getIssue(created.key, "issuelinks")
    .then((issue) => describeLinkTo(issue.fields?.issuelinks, key))
    .catch(() => null);

  // Both sides go into the cache: the copy so the board shows it before the next
  // sync, the original so its link list picks up the new relation.
  await Promise.all([
    refreshJiraIssueCache(client, created.key, { excludeUserId: session.user.id }),
    refreshJiraIssueCache(client, key, { excludeUserId: session.user.id }),
  ]);

  return NextResponse.json({
    ok: true,
    key: created.key,
    summary: clone.summary,
    relation,
    linkError,
    skippedFields: clone.skipped,
  });
}
