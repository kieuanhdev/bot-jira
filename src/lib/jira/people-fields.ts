import type { PeopleRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSystemJiraAuth, jiraIssueFields, jiraWith, type JiraClient } from "./client";
import type { JiraEditField } from "./types";
import { normalizeProjectKey } from "./project-catalog";

export const DEFAULT_PEOPLE_FIELDS: Record<PeopleRole, string> = {
  reporter: "reporter",
  approver: "customfield_10300",
  tester: "customfield_10501",
};

const APPROVER_NAME_PATTERN = /^approver$/i;
const TESTER_NAME_PATTERN = /^(assignee tester|tester)$/i;

export type ProjectPeopleFieldsMap = {
  reporter: string;
  approver?: string | null;
  tester?: string | null;
};

export async function jiraIssueFieldsForProject(projectKey: string): Promise<string> {
  const fields = await getProjectPeopleFields(projectKey).catch(() => ({
    reporter: DEFAULT_PEOPLE_FIELDS.reporter,
    approver: DEFAULT_PEOPLE_FIELDS.approver,
    tester: DEFAULT_PEOPLE_FIELDS.tester,
  }));
  return jiraIssueFields(Object.values(fields).filter((value): value is string => Boolean(value)));
}

/**
 * Returns the effective people field IDs for a project.
 * Uses stored configuration if present; falls back to default IDs.
 */
export async function getProjectPeopleFields(
  projectKey: string
): Promise<ProjectPeopleFieldsMap> {
  const key = normalizeProjectKey(projectKey);
  const rows = await prisma.projectPeopleField.findMany({
    where: { projectKey: key },
  });

  const map: ProjectPeopleFieldsMap = {
    reporter: DEFAULT_PEOPLE_FIELDS.reporter,
    approver: null,
    tester: null,
  };

  for (const row of rows) {
    if (row.role === "reporter") map.reporter = row.jiraFieldId;
    if (row.role === "approver") map.approver = row.jiraFieldId;
    if (row.role === "tester") map.tester = row.jiraFieldId;
  }

  return map;
}

/**
 * Detects people custom fields (Approver, Assignee Tester, Reporter) for a project
 * by examining editmeta on recent issues.
 *
 * Rules:
 * - Reporter is standard and always set to "reporter".
 * - Approver and Assignee Tester field IDs are detected by matching field names.
 * - Does NOT overwrite rows where source === 'manual'.
 */
export async function detectPeopleFields(
  projectKey: string,
  customClient?: JiraClient
): Promise<ProjectPeopleFieldsMap> {
  const key = normalizeProjectKey(projectKey);
  const auth = (await getSystemJiraAuth()) ?? undefined;
  const client = customClient ?? jiraWith(auth);

  const existing = await prisma.projectPeopleField.findMany({
    where: { projectKey: key },
  });
  const manualRoles = new Set(
    existing.filter((e) => e.source === "manual").map((e) => e.role)
  );

  const now = new Date();

  // Always ensure reporter is recorded
  if (!manualRoles.has("reporter")) {
    await prisma.projectPeopleField.upsert({
      where: { projectKey_role: { projectKey: key, role: "reporter" } },
      create: {
        projectKey: key,
        role: "reporter",
        jiraFieldId: "reporter",
        source: "detected",
        detectedAt: now,
      },
      update: {
        jiraFieldId: "reporter",
        source: "detected",
        detectedAt: now,
      },
    });
  }

  let detectedApprover: string | null = null;
  let detectedTester: string | null = null;
  // Only trust "field not found" when Jira actually answered; a failed or empty
  // probe must not wipe previously detected mappings.
  let metaReads = 0;

  try {
    const issueTypes = await client.getProjectStatuses(key).catch(() => []);
    const samples = await Promise.all(
      (issueTypes.length > 0 ? issueTypes : [{ name: "" }]).map(async (issueType) => {
        const typeClause = issueType.name
          ? ` AND issuetype = "${issueType.name.replace(/"/g, '\\"')}"`
          : "";
        const result = await client.search(
          `project = "${key}"${typeClause} ORDER BY updated DESC`,
          1
        ).catch(() => ({ issues: [] }));
        return result.issues?.[0] ?? null;
      })
    );
    const issues = samples.filter((issue): issue is NonNullable<typeof issue> => Boolean(issue));

    for (const issue of issues) {
      if (detectedApprover && detectedTester) break;
      try {
        const meta = await client.getEditMeta(issue.key);
        metaReads++;
        const fields = (meta.fields ?? {}) as Record<string, JiraEditField>;
        for (const [fieldId, fieldDef] of Object.entries(fields)) {
          const name = (fieldDef.name ?? "").trim();
          if (!detectedApprover && APPROVER_NAME_PATTERN.test(name)) {
            detectedApprover = fieldId;
          }
          if (!detectedTester && TESTER_NAME_PATTERN.test(name)) {
            detectedTester = fieldId;
          }
        }
      } catch {
        // Individual editmeta errors are tolerated across sample issues
      }
    }
  } catch {
    // Project search error tolerated (e.g. newly created empty project)
  }

  if (detectedApprover && !manualRoles.has("approver")) {
    await prisma.projectPeopleField.upsert({
      where: { projectKey_role: { projectKey: key, role: "approver" } },
      create: {
        projectKey: key,
        role: "approver",
        jiraFieldId: detectedApprover,
        source: "detected",
        detectedAt: now,
      },
      update: {
        jiraFieldId: detectedApprover,
        source: "detected",
        detectedAt: now,
      },
    });
  }
  if (metaReads > 0 && !detectedApprover && !manualRoles.has("approver")) {
    await prisma.projectPeopleField.deleteMany({
      where: { projectKey: key, role: "approver", source: "detected" },
    });
  }

  if (detectedTester && !manualRoles.has("tester")) {
    await prisma.projectPeopleField.upsert({
      where: { projectKey_role: { projectKey: key, role: "tester" } },
      create: {
        projectKey: key,
        role: "tester",
        jiraFieldId: detectedTester,
        source: "detected",
        detectedAt: now,
      },
      update: {
        jiraFieldId: detectedTester,
        source: "detected",
        detectedAt: now,
      },
    });
  }
  if (metaReads > 0 && !detectedTester && !manualRoles.has("tester")) {
    await prisma.projectPeopleField.deleteMany({
      where: { projectKey: key, role: "tester", source: "detected" },
    });
  }

  return getProjectPeopleFields(key);
}
