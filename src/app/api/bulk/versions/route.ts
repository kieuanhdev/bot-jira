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

export type BulkVersionOption = {
  name: string;
  projects: string[];
  releasedProjects: string[];
  archivedProjects: string[];
};

/** List existing Jira Fix Versions grouped by name across the selected projects. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, boardProjects: true },
  });

  const userProjects = (user?.boardProjects ?? []).map(normalizeProjectKey);
  const rawProjects = Array.from(new Set(
    (new URL(req.url).searchParams.get("projects") ?? "")
      .split(",")
      .map(normalizeProjectKey)
      .filter(Boolean)
  ));

  const validProjects = await Promise.all(
    rawProjects.map(async (project) => {
      const allowed = (await isCatalogProject(project)) || userProjects.includes(project);
      return allowed ? project : null;
    })
  );
  const requestedProjects = validProjects.filter((p): p is string => Boolean(p));

  if (requestedProjects.length === 0) {
    return NextResponse.json({ items: [], projects: [], unavailableProjects: [] });
  }

  const auth = userJiraAuth(user);
  if (!auth) {
    return jiraCredentialsRequired();
  }

  const client = jiraWith(auth);
  const results = await Promise.all(requestedProjects.map(async (project) => {
    try {
      return { project, versions: await client.getVersions(project), error: false as const };
    } catch {
      return { project, versions: [], error: true as const };
    }
  }));

  const byName = new Map<string, BulkVersionOption>();
  for (const result of results) {
    for (const version of result.versions) {
      const name = version.name.trim();
      if (!name) continue;
      const option = byName.get(name) ?? {
        name,
        projects: [],
        releasedProjects: [],
        archivedProjects: [],
      };
      option.projects.push(result.project);
      if (version.released) option.releasedProjects.push(result.project);
      if (version.archived) option.archivedProjects.push(result.project);
      byName.set(name, option);
    }
  }

  const items = [...byName.values()]
    .map((item) => ({
      ...item,
      projects: item.projects.sort(),
      releasedProjects: item.releasedProjects.sort(),
      archivedProjects: item.archivedProjects.sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return NextResponse.json({
    items,
    projects: requestedProjects,
    unavailableProjects: results.filter((result) => result.error).map((result) => result.project),
  });
}
