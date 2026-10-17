import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasOpenAiConfig } from "@/lib/env";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith, JiraRequestError } from "@/lib/jira/client";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";
import { fetchBulkCreateMetadata } from "@/lib/bulk/create-metadata";
import { generateJson } from "@/lib/ai/generate-json";
import { AiUnavailableError } from "@/lib/ai/errors";
import {
  SUBTASK_SPLIT_PROMPT_VERSION,
  SubtaskSplitError,
  buildSubtaskSplitItems,
  buildSubtaskSplitPrompt,
  parseSubtaskSplit,
  resolveSubtaskPlacement,
} from "@/lib/ai/subtask-split-prompt";
import { logger } from "@/lib/logger";

const AI_UNAVAILABLE_MESSAGE = "AI không phản hồi, thử lại";
const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/;

type SubtaskSplitBody = { projectKey?: unknown; parentKey?: unknown };

/**
 * Split an existing Jira task into suggested sub-task rows for the bulk create
 * screen. The parent's summary, description and issue type are read from Jira
 * with the caller's token (clients only send keys). Never creates an issue and
 * never logs the task text.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasOpenAiConfig()) {
    return NextResponse.json({ error: "Chưa cấu hình AI trên máy chủ." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as SubtaskSplitBody;
  const projectKey = typeof body.projectKey === "string" ? body.projectKey.trim().toUpperCase() : "";
  const parentKey = typeof body.parentKey === "string" ? body.parentKey.trim().toUpperCase() : "";
  if (!projectKey) {
    return NextResponse.json({ error: "Thiếu dự án." }, { status: 400 });
  }
  if (!ISSUE_KEY_PATTERN.test(parentKey)) {
    return NextResponse.json({ error: "Mã task cha không hợp lệ." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, jiraUsername: true },
  });
  const auth = userJiraAuth(user);
  if (!auth || !auth.token) {
    return jiraCredentialsRequired();
  }

  const jira = jiraWith(auth);
  let metadata;
  let parent;
  try {
    [metadata, parent] = await Promise.all([
      fetchBulkCreateMetadata(jira, projectKey, auth),
      jira.getIssue(parentKey, "summary,description,issuetype,project"),
    ]);
  } catch (err) {
    if (err instanceof JiraRequestError && err.status !== null && err.status < 500) {
      const message = err.status === 404 ? `Không tìm thấy task ${parentKey}.` : err.message;
      return NextResponse.json({ error: message }, { status: err.status });
    }
    logger.error({
      message: "AI sub-task split: failed to load parent or project metadata",
      projectKey,
      parentKey,
      error: (err as Error).message,
    });
    return NextResponse.json({ error: "Không tải được thông tin task." }, { status: 502 });
  }

  const parentProject = parent.fields.project?.key?.toUpperCase();
  if (parentProject && parentProject !== projectKey) {
    return NextResponse.json({ error: `Task ${parentKey} không thuộc dự án ${projectKey}.` }, { status: 400 });
  }
  if (!metadata.canCreate) {
    return NextResponse.json(
      { error: metadata.permissionReason || "Bạn không có quyền tạo task trong dự án này." },
      { status: 403 }
    );
  }

  let issueTypeId: string;
  try {
    const issueType = parent.fields.issuetype as { id?: string; name?: string; subtask?: boolean } | undefined;
    ({ issueTypeId } = resolveSubtaskPlacement(metadata, {
      issueTypeId: issueType?.id,
      issueTypeName: issueType?.name,
      subtask: issueType?.subtask,
    }));
  } catch (err) {
    if (err instanceof SubtaskSplitError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
    }
    throw err;
  }

  const summary = typeof parent.fields.summary === "string" ? parent.fields.summary : "";
  const description = typeof parent.fields.description === "string" ? parent.fields.description : "";
  const prompt = buildSubtaskSplitPrompt({
    summary,
    description,
    components: (metadata.components ?? []).map((c) => c.name),
  });

  const startedAt = Date.now();
  try {
    const raws = await generateJson(prompt, parseSubtaskSplit);
    const { items, warnings } = buildSubtaskSplitItems(raws, metadata, { parentKey, issueTypeId });
    logger.info({
      message: "AI sub-task split generated",
      promptVersion: SUBTASK_SPLIT_PROMPT_VERSION,
      projectKey,
      parentKey,
      userId: session.user.id,
      descriptionLength: description.length,
      itemCount: items.length,
      warningCount: warnings.length,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      logger.warn({
        message: "AI sub-task split unavailable",
        promptVersion: SUBTASK_SPLIT_PROMPT_VERSION,
        projectKey,
        parentKey,
        userId: session.user.id,
        durationMs: Date.now() - startedAt,
        error: err.message,
      });
      return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 502 });
    }
    logger.error({
      message: "AI sub-task split failed",
      promptVersion: SUBTASK_SPLIT_PROMPT_VERSION,
      projectKey,
      parentKey,
      error: (err as Error).message,
    });
    return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 500 });
  }
}
