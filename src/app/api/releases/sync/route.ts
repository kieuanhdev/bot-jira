import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { syncReleasesFromJira } from "@/lib/releases/sync";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const projectKey = url.searchParams.get("projectKey")?.trim();
  const isSingle = Boolean(projectKey && projectKey !== "all");
  const projectKeys = isSingle ? [projectKey!] : undefined;

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

    if (isSingle) {
      const prjResult = result.projects?.find((p) => p.projectKey === projectKey);
      if (prjResult) {
        if (prjResult.state === "auth_required") {
          return NextResponse.json(
            {
              error: prjResult.errorMessage || "Chưa cấu hình tài khoản Jira hợp lệ để đồng bộ bản phát hành.",
              code: prjResult.errorCode || "jira_credentials_required",
              result,
            },
            { status: 428 }
          );
        }
        if (prjResult.state === "forbidden") {
          return NextResponse.json(
            {
              error: prjResult.errorMessage || `Bạn không có quyền truy cập Fix Version của dự án ${projectKey}.`,
              code: prjResult.errorCode || "jira_forbidden",
              result,
            },
            { status: 403 }
          );
        }
        if (prjResult.state === "failed") {
          const status = prjResult.errorCode === "project_not_found" ? 404 : 502;
          return NextResponse.json(
            {
              error: prjResult.errorMessage || `Lỗi đồng bộ Fix Version của dự án ${projectKey}.`,
              code: prjResult.errorCode || "jira_unavailable",
              result,
            },
            { status }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      result,
      partial: result.errors.length > 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Lỗi đồng bộ bản phát hành", code: "jira_unavailable" },
      { status: 500 }
    );
  }
}
