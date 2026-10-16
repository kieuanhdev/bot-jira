import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/session";
import { listAuditEntries } from "@/lib/admin/audit";

export { listAuditEntries };

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limitParam = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const data = await listAuditEntries(limitParam);

  return NextResponse.json(data);
}
