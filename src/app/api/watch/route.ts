import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listWatchedItems } from "@/lib/watch/list";

/** List the current user's watched tasks, joined with their cache data. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const items = await listWatchedItems(session.user.id, session.user.role);
  return NextResponse.json({ items });
}
