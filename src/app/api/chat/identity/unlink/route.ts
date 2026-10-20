import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { ChatUnlinkBodySchema } from "@/lib/api/schemas";
import { getSession } from "@/lib/session";
import { unlinkChatIdentity } from "@/lib/chat/identity";

/** Unlink the current user's chat account. Body: { provider: "discord" } */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsedBody = await readJsonBody(req, ChatUnlinkBodySchema, { allowEmpty: true });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const provider = (body.provider ?? "discord").trim().toLowerCase();
  const removed = await unlinkChatIdentity(session.user.id, provider);
  return NextResponse.json({ removed });
}
