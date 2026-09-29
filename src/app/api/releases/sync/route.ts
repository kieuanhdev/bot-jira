import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { syncReleasesFromJira } from "@/lib/releases/sync";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!can(session, "release.manage")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const projectKey = url.searchParams.get("projectKey")?.trim();
  const projectKeys = projectKey && projectKey !== "all" ? [projectKey] : undefined;

  try {
    const result = await syncReleasesFromJira({
      userId: session.user.id,
      projectKeys,
    });

    await audit({
      actorId: session.user.id,
      actorEmail: session.user.email ?? null,
      action: "release.sync",
      source: "web",
      target: projectKey ?? "all",
      after: {
        syncedProjects: result.syncedProjects,
        totalReleases: result.totalReleases,
        created: result.created,
        updated: result.updated,
        tasksLinked: result.tasksLinked,
      },
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Lỗi đồng bộ bản phát hành" },
      { status: 500 }
    );
  }
}
