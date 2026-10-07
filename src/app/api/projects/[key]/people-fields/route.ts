import { NextResponse } from "next/server";
import type { PeopleRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isAdminRole } from "@/lib/permissions";
import { normalizeProjectKey } from "@/lib/jira/project-catalog";
import { detectPeopleFields, getProjectPeopleFields } from "@/lib/jira/people-fields";

const PEOPLE_ROLES: PeopleRole[] = ["reporter", "approver", "tester"];
const FIELD_ID = /^(reporter|customfield_\d+)$/;

async function keyFrom(ctx: { params: Promise<{ key: string }> }) {
  return normalizeProjectKey((await ctx.params).key);
}

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const projectKey = await keyFrom(ctx);
  const [fields, rows] = await Promise.all([
    getProjectPeopleFields(projectKey),
    prisma.projectPeopleField.findMany({ where: { projectKey }, orderBy: { role: "asc" } }),
  ]);
  return NextResponse.json({ projectKey, fields, items: rows });
}

export async function PUT(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminRole(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const projectKey = await keyFrom(ctx);
  const body = await req.json().catch(() => ({})) as { fields?: Partial<Record<PeopleRole, string | null>> };
  if (!body.fields || typeof body.fields !== "object") {
    return NextResponse.json({ error: "fields is required" }, { status: 400 });
  }

  for (const role of PEOPLE_ROLES) {
    const raw = body.fields[role];
    if (raw != null && raw.trim() !== "" && !FIELD_ID.test(raw.trim())) {
      return NextResponse.json({ error: `Invalid Jira field id for ${role}` }, { status: 400 });
    }
  }
  await prisma.$transaction(async (tx) => {
    for (const role of PEOPLE_ROLES) {
      if (!(role in body.fields!)) continue;
      const raw = body.fields![role];
      if (raw == null || raw.trim() === "") {
        await tx.projectPeopleField.deleteMany({ where: { projectKey, role } });
      } else {
        const jiraFieldId = raw.trim();
        await tx.projectPeopleField.upsert({
          where: { projectKey_role: { projectKey, role } },
          create: { projectKey, role, jiraFieldId, source: "manual", detectedAt: new Date() },
          update: { jiraFieldId, source: "manual", detectedAt: new Date() },
        });
      }
    }
  });
  return NextResponse.json({ projectKey, fields: await getProjectPeopleFields(projectKey) });
}

export async function POST(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminRole(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const projectKey = await keyFrom(ctx);
  return NextResponse.json({ projectKey, fields: await detectPeopleFields(projectKey) });
}
