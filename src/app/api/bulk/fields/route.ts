import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  isCatalogProject,
  normalizeProjectKey,
} from "@/lib/jira/project-catalog";
import { jiraWith } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";

export type BulkFieldOption = {
  id: "assignee" | "labels" | "priority" | "issueType" | "points" | "estimate" | "dueDate" | "fixVersions" | "epic";
  jiraFieldId: string;
  name: string;
  available: boolean;
  options?: string[];
};

/**
 * Fetch editable fields metadata for a project from Jira editmeta.
 * Scoped to a specific project.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const project = normalizeProjectKey(url.searchParams.get("project") ?? "");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, boardProjects: true },
  });

  const userProjects = (user?.boardProjects ?? []).map(normalizeProjectKey);
  const isAllowed = project && ((await isCatalogProject(project)) || userProjects.includes(project));
  if (!project || !isAllowed) {
    return NextResponse.json({ error: "Invalid or missing project parameter" }, { status: 400 });
  }

  const auth = userJiraAuth(user);
  if (!auth) {
    return jiraCredentialsRequired();
  }

  const client = jiraWith(auth);

  const sampleKeyParam = url.searchParams.get("sampleKey")?.trim().toUpperCase();
  let sampleKey = sampleKeyParam && sampleKeyParam.startsWith(`${project}-`) ? sampleKeyParam : null;

  if (!sampleKey) {
    const cached = await prisma.issueCache.findFirst({
      where: { projectKey: project, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: { jiraKey: true },
    });
    sampleKey = cached?.jiraKey ?? null;
  }

  // If not cached yet, try querying 1 issue live from Jira so field metadata is exact
  if (!sampleKey) {
    try {
      const searchRes = await client.search(`project = ${project} ORDER BY updated DESC`, 1);
      sampleKey = searchRes.issues?.[0]?.key ?? null;
    } catch {
      // ignore live search errors and use fallback below
    }
  }

  const defaultFields: BulkFieldOption[] = [
    { id: "assignee", jiraFieldId: "assignee", name: "Người phụ trách", available: true },
    { id: "labels", jiraFieldId: "labels", name: "Nhãn", available: true },
    { id: "priority", jiraFieldId: "priority", name: "Độ ưu tiên", available: true },
    { id: "issueType", jiraFieldId: "issuetype", name: "Type", available: true },
    { id: "points", jiraFieldId: "points", name: "Story/Task Points", available: true },
    { id: "estimate", jiraFieldId: "timetracking", name: "Original Estimate", available: true },
    { id: "dueDate", jiraFieldId: "duedate", name: "Due date", available: true },
    { id: "fixVersions", jiraFieldId: "fixVersions", name: "Fix Versions", available: true },
    { id: "epic", jiraFieldId: "epic", name: "Epic / Task cha", available: true },
  ];

  if (!sampleKey) {
    return NextResponse.json({
      project,
      sampleKey: null,
      fields: defaultFields,
      fallback: true,
    });
  }

  try {
    const [editMeta, pointsField, issueTypes] = await Promise.all([
      client.getEditMeta(sampleKey).catch(() => null),
      client.resolvePointsField(sampleKey).catch(() => null),
      client.getCreateMetaIssueTypes(project).catch(() => null),
    ]);

    if (!editMeta?.fields) {
      return NextResponse.json({
        project,
        sampleKey,
        fields: defaultFields,
        fallback: true,
      });
    }

    const m = editMeta.fields;
    const epicEntry = Object.entries(m).find(([id, field]) => {
      const lowerName = field.name?.trim().toLowerCase() ?? "";
      return (
        id === "parent" ||
        lowerName === "epic link" ||
        lowerName === "epic" ||
        (field.schema as { custom?: string })?.custom === "com.pyxis.greenhopper.jira:gh-epic-link"
      );
    });

    const fields: BulkFieldOption[] = [
      { id: "assignee", jiraFieldId: "assignee", name: m.assignee?.name ?? "Người phụ trách", available: Boolean(m.assignee) },
      { id: "labels", jiraFieldId: "labels", name: m.labels?.name ?? "Nhãn", available: Boolean(m.labels) },
      { id: "priority", jiraFieldId: "priority", name: m.priority?.name ?? "Độ ưu tiên", available: Boolean(m.priority) },
      {
        id: "issueType", jiraFieldId: "issuetype", name: m.issuetype?.name ?? "Type",
        available: Boolean(m.issuetype),
        options: (issueTypes?.values ?? []).map((type) => type.name).filter((name): name is string => Boolean(name)),
      },
      { id: "points", jiraFieldId: pointsField?.id ?? "points", name: pointsField?.name ?? "Story/Task Points", available: Boolean(pointsField) },
      { id: "estimate", jiraFieldId: "timetracking", name: m.timetracking?.name ?? "Original Estimate", available: Boolean(m.timetracking) },
      { id: "dueDate", jiraFieldId: "duedate", name: m.duedate?.name ?? "Due date", available: Boolean(m.duedate) },
      { id: "fixVersions", jiraFieldId: "fixVersions", name: m.fixVersions?.name ?? "Fix Versions", available: Boolean(m.fixVersions) },
      {
        id: "epic",
        jiraFieldId: epicEntry ? epicEntry[0] : "parent",
        name: epicEntry ? epicEntry[1].name : "Epic / Task cha",
        available: Boolean(epicEntry || m.parent),
      },
    ];

    return NextResponse.json({
      project,
      sampleKey,
      fields,
      fallback: false,
    });
  } catch {
    return NextResponse.json({
      project,
      sampleKey,
      fields: defaultFields,
      fallback: true,
    });
  }
}
