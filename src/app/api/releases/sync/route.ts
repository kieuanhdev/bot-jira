import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { syncReleasesFromJira } from "@/lib/releases/sync";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const projectKey = url.searchParams.get("projectKey")?.trim();
  const projectKeys = projectKey && projectKey !== "all" ? [projectKey] : undefined;

  try {
    const result = await syncReleasesFromJira({
      userId: session.user.id,
      projectKeys,
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
