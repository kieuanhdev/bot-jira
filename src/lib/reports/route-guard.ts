import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can, type Permission } from "@/lib/permissions";
import { resolveUserProjectScope, assertProjectAccess } from "@/lib/reports/scope";

type GuardResult = { projectKey: string; response?: undefined } | { projectKey?: undefined; response: NextResponse };

/**
 * Shared prelude for `/api/reports/projects/[projectKey]/*` handlers:
 * session -> permission -> project key -> project scope.
 * Returns either the validated `projectKey` or the error response to send back.
 */
export async function guardProjectReport(
  params: Promise<{ projectKey: string }>,
  options: { permission?: Permission; forbiddenMessage?: (projectKey: string) => string } = {}
): Promise<GuardResult> {
  const { permission = "report.view", forbiddenMessage } = options;

  const session = await getSession();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  if (!can(session, permission)) {
    return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  const { projectKey } = await params;
  if (!projectKey) {
    return { response: NextResponse.json({ error: "project_key_required" }, { status: 400 }) };
  }

  const userScope = await resolveUserProjectScope(session.user.id, session.user.role);
  const isAllowed = await assertProjectAccess(projectKey, userScope);
  if (!isAllowed) {
    return {
      response: NextResponse.json(
        {
          error: "forbidden",
          message: forbiddenMessage?.(projectKey) ?? `Bạn không có quyền truy cập dự án '${projectKey}'.`,
        },
        { status: 403 }
      ),
    };
  }

  return { projectKey };
}
