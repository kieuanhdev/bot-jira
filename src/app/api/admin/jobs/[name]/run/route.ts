import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/session";
import { startBoss } from "@/lib/queue/boss";
import { buildScheduleDefinitions } from "@/lib/queue/schedules";
import type { JobName } from "@/lib/queue/job-names";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

export async function POST(
  _req: Request,
  props: { params: Promise<{ name: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { name } = await props.params;
  const allowlist = new Set<string>(buildScheduleDefinitions(env.pollIntervalMs).map((s) => s.name));

  if (!allowlist.has(name as JobName)) {
    return NextResponse.json(
      { error: `Job '${name}' is not in manual run allowlist` },
      { status: 400 }
    );
  }

  try {
    const boss = await startBoss();
    const jobId = await boss.send(name, {}, {
      singletonKey: `${name}:manual`,
      singletonSeconds: 30,
      retryLimit: 0,
    });

    if (!jobId) {
      return NextResponse.json(
        { error: "Job is already queued or running" },
        { status: 409 }
      );
    }

    await audit({
      actorId: session.user.id,
      actorEmail: session.user.email,
      action: "admin.job.run",
      target: name,
      source: "web",
    });

    return NextResponse.json({ ok: true, jobId, name });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
