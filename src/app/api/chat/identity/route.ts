import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listIdentitiesForUser } from "@/lib/chat/identity";

/** List the current user's linked chat identities. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const identities = await listIdentitiesForUser(session.user.id);
  return NextResponse.json({ identities });
}
