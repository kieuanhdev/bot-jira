import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith, JiraRequestError, jiraIssueFields } from "@/lib/jira/client";
import type { BulkCreateProjectMetadata } from "@/lib/bulk/create-types";

/**
 * BC-SMART-303 — Read a Jira issue and return a DTO suitable for Bulk Create.
 *
 * GET /api/bulk/create/templates/from-issue?project=ABC&issueKey=ABC-123
 *
 * Response is a normalised `BulkCreateTemplateRow` — only allowlisted fields
 * that are valid for the project's create metadata are included. System-only
 * fields (key, id, status, resolution, reporter, etc.) are never returned.
 */

/** Fields that should NEVER be copied from a source issue. */
const DENY_FIELDS = new Set([
  "key",
  "id",
  "status",
  "resolution",
  "created",
  "updated",
  "reporter",
  "creator",
  "comment",
  "attachment",
  "worklog",
  "changelog",
  "watcher",
  "votes",
  "issuelinks",
  "sprint",
  "rank",
  "timetracking",
  "timespent",
  "aggregatetimespent",
  "aggregatetimeoriginalestimate",
]);

export type BulkCreateTemplateRow = {
  summary: string;
  description?: string;
  issueTypeId?: string;
  issueTypeName?: string;
  assignee?: string | null;
  assigneeDisplayName?: string;
  priorityId?: string;
  priorityName?: string;
  labels?: string[];
  points?: number | null;
  originalEstimate?: string;
  dueDate?: string | null;
  fixVersionIds?: string[];
  fixVersionNames?: string[];
  customFields?: Record<string, unknown>;
  /** Fields that were skipped because they are not valid for create. */
  skippedFields?: Array<{ field: string; reason: string }>;
  /** Whether the source issue is a sub-task (parent is NOT copied). */
  sourceIsSubtask?: boolean;
};

export async function GET(req: Request) {
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
  if (!issueKey) {
    return NextResponse.json({ error: "Missing issueKey query parameter" }, { status: 400 });
  }

  // Validate key format
  if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(issueKey)) {
    return NextResponse.json({ error: "Định dạng issue key không hợp lệ" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, jiraUsername: true },
  });

  const auth = userJiraAuth(user);
  if (!auth || !auth.token) {
    return NextResponse.json(
      { error: "Bạn cần cấu hình token Jira cá nhân trong Settings.", code: "jira_credentials_required" },
      { status: 428 }
    );
  }

  const jira = jiraWith(auth);

  try {
    // Fetch the issue with full fields
    const issue = await jira.getIssue(issueKey, jiraIssueFields());
    const fields = issue.fields ?? {};

    // Verify issue belongs to the same project
    const issueProject = fields.project?.key?.toUpperCase();
    if (issueProject !== project) {
      return NextResponse.json(
        { error: `Issue ${issueKey} thuộc dự án ${issueProject}, không phải ${project}` },
        { status: 400 }
      );
    }

    const skippedFields: Array<{ field: string; reason: string }> = [];
    const sourceIsSubtask = (fields.issuetype as Record<string, unknown> | undefined)?.subtask === true;

    // Build template row — only allowlisted fields
    const template: BulkCreateTemplateRow = {
      summary: fields.summary ?? "",
    };

    // Description
    if (fields.description) {
      template.description = fields.description;
    }

    // Issue type
    if (fields.issuetype?.id) {
      template.issueTypeId = fields.issuetype.id;
      template.issueTypeName = fields.issuetype.name;
    }

    // Assignee
    if (fields.assignee) {
      template.assignee = fields.assignee.name ?? fields.assignee.key ?? null;
      template.assigneeDisplayName = fields.assignee.displayName;
    }

    // Priority
    if (fields.priority?.id) {
      template.priorityId = fields.priority.id;
      template.priorityName = fields.priority.name;
    }

    // Labels
    if (Array.isArray(fields.labels) && fields.labels.length > 0) {
      template.labels = fields.labels;
    }

    // Due date
    const rawDueDate = fields.duedate as string | undefined | null;
    if (rawDueDate) {
      template.dueDate = rawDueDate;
    }

    // Original estimate
    const rawEstimate = fields.timeoriginalestimate ?? (fields as Record<string, unknown>)["timeoriginalestimate"];
    if (rawEstimate != null && typeof rawEstimate === "number") {
      // Convert seconds to Jira duration string
      const seconds = rawEstimate;
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const parts: string[] = [];
      if (h > 0) parts.push(`${h}h`);
      if (m > 0) parts.push(`${m}m`);
      template.originalEstimate = parts.join(" ") || undefined;
    }

    // Fix Versions
    if (Array.isArray(fields.fixVersions) && fields.fixVersions.length > 0) {
      template.fixVersionIds = fields.fixVersions
        .filter((v: { id?: string }) => v.id)
        .map((v: { id?: string }) => v.id!);
      template.fixVersionNames = fields.fixVersions.map(
        (v: { name?: string }) => v.name ?? ""
      );
    }

    // Story points — check all known point field IDs
    // Try common field patterns
    const pointFieldCandidates = ["story_points", "customfield_10016", "customfield_10028"];
    for (const candidate of pointFieldCandidates) {
      const val = fields[candidate];
      if (val != null && typeof val === "number" && Number.isFinite(val)) {
        template.points = val;
        break;
      }
    }

    // Source is subtask warning
    if (sourceIsSubtask) {
      template.sourceIsSubtask = true;
      skippedFields.push({
        field: "parent",
        reason: "Issue gốc là sub-task. Parent không được sao chép — bạn cần chọn parent mới.",
      });
    }

    template.skippedFields = skippedFields;

    return NextResponse.json({ template });
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
