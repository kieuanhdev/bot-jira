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
  MAX_IDEA_LENGTH,
  MAX_PROMPT_LABELS,
  TASK_DRAFT_PROMPT_VERSION,
  buildTaskDraftPrefill,
  buildTaskDraftPrompt,
  parseTaskDraft,
  taskDraftPromptLists,
} from "@/lib/ai/task-draft-prompt";
import { logger } from "@/lib/logger";

const AI_UNAVAILABLE_MESSAGE = "AI không phản hồi, thử lại";

type TaskDraftBody = {
  projectKey?: unknown;
  idea?: unknown;
  current?: { summary?: unknown; description?: unknown } | null;
};

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Most used labels of the project from the issue cache (same source as /api/bulk/create/labels). */
async function topProjectLabels(projectKey: string): Promise<string[]> {
  const issues = await prisma.issueCache.findMany({
    where: { projectKey, deletedAt: null },
    select: { labels: true },
    take: 1000,
    orderBy: { lastSyncedAt: "desc" },
  });
  const counts = new Map<string, number>();
  for (const issue of issues) {
    for (const label of issue.labels) {
      const normalized = label.trim();
      if (!normalized || normalized.startsWith("ttw-bulk-")) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PROMPT_LABELS)
    .map(([label]) => label);
}

/**
 * Turn a rough idea into suggested create-form fields. Never creates an issue;
 * the client merges `prefill` into the form. The idea text is never logged.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasOpenAiConfig()) {
    return NextResponse.json({ error: "Chưa cấu hình AI trên máy chủ." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as TaskDraftBody;
  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  if (!idea) {
    return NextResponse.json({ error: "Nhập mô tả ngắn công việc." }, { status: 400 });
  }
  if (idea.length > MAX_IDEA_LENGTH) {
    return NextResponse.json(
      { error: `Mô tả tối đa ${MAX_IDEA_LENGTH} ký tự.` },
      { status: 400 }
    );
  }
  const projectKey = typeof body.projectKey === "string" ? body.projectKey.trim().toUpperCase() : "";
  if (!projectKey) {
    return NextResponse.json({ error: "Thiếu dự án." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, jiraUsername: true },
  });
  const auth = userJiraAuth(user);
  if (!auth || !auth.token) {
    return jiraCredentialsRequired();
  }

  let metadata;
  let labels: string[];
  try {
    [metadata, labels] = await Promise.all([
      fetchBulkCreateMetadata(jiraWith(auth), projectKey, auth),
      topProjectLabels(projectKey),
    ]);
  } catch (err) {
    if (err instanceof JiraRequestError && err.status !== null && err.status < 500) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error({
      message: "AI task draft: failed to load project metadata",
      projectKey,
      error: (err as Error).message,
    });
    return NextResponse.json({ error: "Không tải được thông tin dự án." }, { status: 502 });
  }

  const prompt = buildTaskDraftPrompt({
    idea,
    projectKey,
    ...taskDraftPromptLists(metadata, labels),
    current: {
      summary: optionalText(body.current?.summary),
      description: optionalText(body.current?.description),
    },
  });

  const startedAt = Date.now();
  try {
    const draft = await generateJson(prompt, parseTaskDraft);
    const { prefill, warnings } = buildTaskDraftPrefill(draft, metadata, labels);
    logger.info({
      message: "AI task draft generated",
      promptVersion: TASK_DRAFT_PROMPT_VERSION,
      projectKey,
      userId: session.user.id,
      ideaLength: idea.length,
      warningCount: warnings.length,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ prefill, warnings });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      logger.warn({
        message: "AI task draft unavailable",
        promptVersion: TASK_DRAFT_PROMPT_VERSION,
        projectKey,
        userId: session.user.id,
        ideaLength: idea.length,
        durationMs: Date.now() - startedAt,
        error: err.message,
      });
      return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 502 });
    }
    logger.error({
      message: "AI task draft failed",
      promptVersion: TASK_DRAFT_PROMPT_VERSION,
      projectKey,
      error: (err as Error).message,
    });
    return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 500 });
  }
}
