import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith, JiraRequestError, jiraIssueFields } from "@/lib/jira/client";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";
import type {
  BulkCreateTemplateDetailResponse,
  BulkCreateTemplateIssueItem,
  BulkCreateTemplateRow,
  BulkCreateTemplateSearchResponse,
} from "@/lib/contracts/bulk-create-template";

export type {
  BulkCreateTemplateIssueItem,
  BulkCreateTemplateRow,
} from "@/lib/contracts/bulk-create-template";

/**
 * BC-SMART-303 — Read a Jira issue or search issues to use as Bulk Create templates.
 *
 * GET /api/bulk/create/templates?project=ABC&issueKey=ABC-123
 * -> Returns { template: BulkCreateTemplateRow }
 *
 * GET /api/bulk/create/templates?project=ABC&q=search&limit=15
 * -> Returns { issues: BulkCreateTemplateIssueItem[] }
 */

const TEMPLATE_SEARCH_CACHE_TTL_MS = 30_000;
const templateSearchCache = new Map<
  string,
  { issues: BulkCreateTemplateIssueItem[]; expiresAt: number }
>();

const pointFieldCandidates = ["story_points", "customfield_10016", "customfield_10028"];

function buildTemplateRowFromFields(
  fields: Record<string, unknown>,
  skippedFields: Array<{ field: string; reason: string }> = []
): BulkCreateTemplateRow {
  const template: BulkCreateTemplateRow = {
    summary: (fields.summary as string) ?? "",
  };

  if (fields.description) {
    template.description = fields.description as string;
  }

  const issueType = fields.issuetype as { id?: string; name?: string } | undefined;
  if (issueType?.id) {
    template.issueTypeId = issueType.id;
    template.issueTypeName = issueType.name;
  }

  const assignee = fields.assignee as { name?: string; key?: string; displayName?: string } | undefined;
  if (assignee) {
    template.assignee = assignee.name ?? assignee.key ?? null;
    template.assigneeDisplayName = assignee.displayName;
  }

  const priority = fields.priority as { id?: string; name?: string } | undefined;
  if (priority?.id) {
    template.priorityId = priority.id;
    template.priorityName = priority.name;
  }

  if (Array.isArray(fields.labels) && fields.labels.length > 0) {
    template.labels = fields.labels as string[];
  }

  const rawDueDate = fields.duedate as string | undefined | null;
  if (rawDueDate) {
    template.dueDate = rawDueDate;
  }

  const rawEstimate = fields.timeoriginalestimate ?? (fields as Record<string, unknown>)["timeoriginalestimate"];
  if (rawEstimate != null && typeof rawEstimate === "number") {
    const seconds = rawEstimate;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts: string[] = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    template.originalEstimate = parts.join(" ") || undefined;
  }

  if (Array.isArray(fields.fixVersions) && fields.fixVersions.length > 0) {
    template.fixVersionIds = fields.fixVersions
      .filter((v: { id?: string }) => v.id)
      .map((v: { id?: string }) => v.id!);
    template.fixVersionNames = fields.fixVersions.map(
      (v: { name?: string }) => v.name ?? ""
    );
  }

  for (const candidate of pointFieldCandidates) {
    const val = fields[candidate];
    if (val != null && typeof val === "number" && Number.isFinite(val)) {
      template.points = val;
      break;
    }
  }

  template.skippedFields = skippedFields;
  return template;
}

export async function handleBulkTemplateRequest(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const project = url.searchParams.get("project")?.trim().toUpperCase();
  const issueKey = url.searchParams.get("issueKey")?.trim().toUpperCase();

  if (!project) {
    return NextResponse.json({ error: "Missing project query parameter" }, { status: 400 });
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

  // If issueKey is provided, return full template details for that issue
  if (issueKey) {
    if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(issueKey)) {
      return NextResponse.json({ error: "Định dạng issue key không hợp lệ" }, { status: 400 });
    }

    try {
      const issue = await jira.getIssue(issueKey, jiraIssueFields());
      const fields = (issue.fields ?? {}) as Record<string, unknown>;

      const issueProject = (fields.project as { key?: string } | undefined)?.key?.toUpperCase();
      if (issueProject !== project) {
        return NextResponse.json(
          { error: `Issue ${issueKey} thuộc dự án ${issueProject}, không phải ${project}` },
          { status: 400 }
        );
      }

      const skippedFields: Array<{ field: string; reason: string }> = [];
      const template = buildTemplateRowFromFields(fields, skippedFields);

      // Check if subtask or has parent
      const parentObj = fields.parent as
        | { id?: string; key?: string; fields?: Record<string, unknown> }
        | undefined;
      const isSubtaskType =
        (fields.issuetype as { subtask?: boolean; name?: string } | undefined)?.subtask === true ||
        (fields.issuetype as { name?: string } | undefined)?.name?.toLowerCase() === "sub-task";

      if (isSubtaskType || Boolean(parentObj?.key)) {
        template.sourceIsSubtask = true;
        if (parentObj?.key) {
          template.parentKey = parentObj.key;
          template.parentSummary = (parentObj.fields?.summary as string) || "";
          const parentType = parentObj.fields?.issuetype as { id?: string; name?: string } | undefined;
          template.parentIssueTypeId = parentType?.id;
          template.parentIssueTypeName = parentType?.name;

          // Fetch full parent issue so user can clone both parent and subtask if desired
          try {
            const parentIssue = await jira.getIssue(parentObj.key, jiraIssueFields());
            if (parentIssue?.fields) {
              template.parentTemplate = buildTemplateRowFromFields(
                parentIssue.fields as Record<string, unknown>
              );
            }
          } catch {
            // Parent basic details already captured
          }
        }
      }

      const response: BulkCreateTemplateDetailResponse = { template };
      return NextResponse.json(response);
    } catch (err) {
      if (err instanceof JiraRequestError) {
        if (err.status === 404) {
          return NextResponse.json(
            { error: `Không tìm thấy issue ${issueKey} hoặc bạn không có quyền browse.` },
            { status: 404 }
          );
        }
        if (err.status === 403) {
          return NextResponse.json(
            { error: `Bạn không có quyền xem issue ${issueKey}.` },
            { status: 403 }
          );
        }
        return NextResponse.json({ error: err.message }, { status: err.status || 500 });
      }
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  // Otherwise, list recent issues or search by query
  const rawQuery = url.searchParams.get("q")?.trim() ?? "";
  const query = rawQuery.slice(0, 100);
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") ?? "15", 10)), 30);

  const cacheKey = `${auth.token.slice(0, 8)}:${project}:${query.toLowerCase()}:${limit}`;
  const cached = templateSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const response: BulkCreateTemplateSearchResponse = { issues: cached.issues };
    return NextResponse.json(response);
  }

  try {
    const issues = await jira.searchTemplateIssues(project, query, limit);
    templateSearchCache.set(cacheKey, { issues, expiresAt: Date.now() + TEMPLATE_SEARCH_CACHE_TTL_MS });
    const response: BulkCreateTemplateSearchResponse = { issues };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof JiraRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status || 500 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
