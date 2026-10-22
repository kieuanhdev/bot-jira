import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { recordActivity, type ActivityEventType } from "@/lib/activity/service";

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      // Body empty or malformed
    }

    const session = await getSession();

    const path = typeof body.path === "string" && body.path.trim() ? body.path.trim() : "/";
    const eventType: ActivityEventType =
      body.eventType === "action" || body.eventType === "auth" ? body.eventType : "page_view";
    const action = typeof body.action === "string" && body.action.trim() ? body.action.trim() : "page.view";
    const description = typeof body.description === "string" ? body.description.trim() : null;

    const userAgent = req.headers.get("user-agent");
    const forwarded = req.headers.get("x-forwarded-for");
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip");

    await recordActivity({
      userId: session?.user?.id ?? null,
      userName: session?.user?.name ?? null,
      userEmail: session?.user?.email ?? null,
      eventType,
      action,
      description,
      path,
      userAgent,
      ipAddress,
      metadata: body.metadata,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 }); // Always 200 to prevent noisy client errors
  }
}
