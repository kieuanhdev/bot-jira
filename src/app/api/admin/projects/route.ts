import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/session";
import { listAdminProjectSync, toggleAllProjectSync } from "@/lib/admin/project-sync";

export const dynamic = "force-dynamic";

/** Admin-only: every active project with its sync switch and last sync outcome. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({ items: await listAdminProjectSync(), generatedAt: new Date().toISOString() });
}

/** Admin-only: turn sync on or off for every active project. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { syncEnabled?: unknown };
  if (typeof body.syncEnabled !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await toggleAllProjectSync(body.syncEnabled, {
    id: session.user.id,
    email: session.user.email,
  });
  return NextResponse.json({ syncEnabled: body.syncEnabled, ...result });
}
