import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getSystemJiraAuth, jiraWith } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { key?: string };
  const rawKey = (body.key ?? "").trim().toUpperCase();

  if (!rawKey) {
    return NextResponse.json({ ok: false, error: "Vui lòng nhập mã dự án." }, { status: 400 });
  }

  // Jira project keys are typically alphanumeric uppercase
  if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(rawKey)) {
    return NextResponse.json(
      { ok: false, error: "Mã dự án không hợp lệ (ví dụ: PROJ, MOBILE, EPM)." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });

  const auth = userJiraAuth(user) ?? (await getSystemJiraAuth());
  if (!auth) {
    return NextResponse.json(
      { ok: false, error: "Chưa cấu hình tài khoản Jira. Vui lòng kết nối Jira trước." },
      { status: 428 }
    );
  }

  const client = jiraWith(auth);

  try {
    const project = await client.getProject(rawKey);
    if (!project || !project.key) {
      return NextResponse.json(
        { ok: false, error: `Không tìm thấy thông tin dự án ${rawKey} trên Jira.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      project: {
        key: project.key,
        name: project.name || project.key,
        id: project.id,
      },
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status === 404) {
      return NextResponse.json(
        { ok: false, error: `Dự án "${rawKey}" không tồn tại trên hệ thống Jira.` },
        { status: 404 }
      );
    }
    if (err.status === 401 || err.status === 403) {
      return NextResponse.json(
        { ok: false, error: `Tài khoản Jira của bạn không có quyền truy cập dự án "${rawKey}".` },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { ok: false, error: err.message || `Lỗi khi kiểm tra dự án "${rawKey}" trên Jira.` },
      { status: 500 }
    );
  }
}
