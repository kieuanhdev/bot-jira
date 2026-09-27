import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  getDiscordIntegration,
  removeDiscordIntegration,
  saveDiscordIntegration,
  type DiscordDestinationType,
} from "@/lib/chat/discord-integration";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ integration: await getDiscordIntegration(session.user.id) });
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    destinationType?: DiscordDestinationType;
    discordUserId?: string;
    webhookUrl?: string;
  };
  if (body.destinationType !== "webhook" && body.destinationType !== "user_id") {
    return NextResponse.json({ error: "destinationType must be webhook or user_id" }, { status: 400 });
  }

  try {
    await saveDiscordIntegration({
      userId: session.user.id,
      destinationType: body.destinationType,
      discordUserId: body.discordUserId,
      webhookUrl: body.webhookUrl,
    });
    return NextResponse.json({ integration: await getDiscordIntegration(session.user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save Discord integration";
    const conflict = message.includes("P2002") || message.includes("already linked");
    const status = conflict ? 409 : 400;
    return NextResponse.json(
      { error: conflict ? "This Discord User ID is already linked to another account" : message },
      { status }
    );
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ removed: await removeDiscordIntegration(session.user.id) });
}
