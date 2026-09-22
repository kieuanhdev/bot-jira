import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { linkChatIdentity } from "@/lib/chat/identity";

/**
 * Link (or re-link) the current user's chat account.
 * Body: { provider: "discord", externalId: "<discord user id>", displayName? }
 *
 * The external id is the chat platform's stable user id — the user pastes it in
 * the UI. This is the explicit linking required by ADR-005.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    provider?: string;
    externalId?: string;
    displayName?: string;
  };
  const provider = (body.provider ?? "discord").trim().toLowerCase();
  const externalId = (body.externalId ?? "").trim();
  if (!["discord"].includes(provider)) {
    return NextResponse.json({ error: "unsupported provider" }, { status: 400 });
  }
  if (!externalId) {
    return NextResponse.json({ error: "externalId required" }, { status: 400 });
  }

  const identity = await linkChatIdentity({
    userId: session.user.id,
    provider,
    externalId,
    displayName: body.displayName?.trim() || undefined,
  });
  return NextResponse.json({ identity });
}
