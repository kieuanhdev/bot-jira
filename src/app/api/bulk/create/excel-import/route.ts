import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith } from "@/lib/jira/client";
import { fetchBulkCreateMetadata } from "@/lib/bulk/create-ops";
import { parseBulkCreateExcel } from "@/lib/bulk/excel-parser";
import { MAX_FILE_SIZE_BYTES } from "@/lib/bulk/excel-schema";
import { type BulkCreateProjectMetadata } from "@/lib/bulk/create-types";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Yêu cầu phải có định dạng multipart/form-data" },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Thiếu tệp tin tải lên (file)" }, { status: 400 });
  }

  const url = new URL(req.url);
  const projectKey = (
    (formData.get("project") as string) ||
    url.searchParams.get("project") ||
    ""
  )
    .trim()
    .toUpperCase();

  if (!projectKey) {
    return NextResponse.json(
      { error: "Thiếu thông tin mã dự án (project)" },
      { status: 400 }
    );
  }

  // Check extension
  const fileName = file.name || "";
  const dotIdx = fileName.lastIndexOf(".");
  const ext = dotIdx >= 0 ? fileName.slice(dotIdx).toLowerCase() : "";
  if (ext !== ".xlsx") {
    return NextResponse.json(
      {
        error: `Định dạng tệp "${ext || "không xác định"}" không được hỗ trợ. Vui lòng tải lên tệp Excel .xlsx.`,
      },
      { status: 400 }
    );
  }

  // Check size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return NextResponse.json(
      { error: `Tệp "${fileName}" (${sizeMb} MB) vượt quá dung lượng tối đa 5 MB.` },
      { status: 400 }
    );
  }

  // Fetch current project metadata if Jira credentials exist
  let currentMetadata: BulkCreateProjectMetadata | null = null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      jiraUsername: true,
    },
  });

  const auth = userJiraAuth(user);
  if (auth && auth.token) {
    try {
      const jira = jiraWith(auth);
      currentMetadata = await fetchBulkCreateMetadata(jira, projectKey, auth);
    } catch {
      // Non-fatal, parser can still proceed without live metadata
    }
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await parseBulkCreateExcel(arrayBuffer, {
      targetProjectKey: projectKey,
      currentMetadata,
    });

    if (!result.projectKeyMatch) {
      return NextResponse.json(
        {
          error: result.errors[0]?.message || `File không thuộc về dự án ${projectKey}`,
          details: result,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      items: result.items,
      manifest: result.manifest,
      isStaleMetadata: result.isStaleMetadata,
      projectKeyMatch: result.projectKeyMatch,
      fileProjectKey: result.fileProjectKey,
      stats: {
        totalRows: result.totalRows,
        validCount: result.validCount,
        errorCount: result.errorCount,
        skippedEmptyCount: result.skippedEmptyCount,
        overflowCount: result.overflowCount,
      },
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Đã xảy ra lỗi khi đọc file Excel." },
      { status: 422 }
    );
  }
}
