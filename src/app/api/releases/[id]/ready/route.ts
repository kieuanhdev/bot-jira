import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { aiProvider } from "@/lib/ai";
import { notifyAll } from "@/lib/notify";
import { env, releaseDoneCategories, releaseBlockingPriorities } from "@/lib/env";

type TaskInfo = {
  jiraKey: string;
  summary: string;
  description: string;
  priority: string;
  status: string;
  statusCategory: string;
  lastSyncedAt: Date;
};

type GateResult = {
  gate: string;
  state: "passed" | "failed" | "unknown";
  summary: string;
  blockers: { jiraKey?: string; reason: string }[];
};

function checkNonEmpty(tasks: TaskInfo[]): GateResult {
  if (tasks.length === 0) {
    return {
      gate: "non_empty_release",
      state: "failed",
      summary: "Release has no tasks (EMPTY_RELEASE)",
      blockers: [{ reason: "EMPTY_RELEASE" }],
    };
  }
  return { gate: "non_empty_release", state: "passed", summary: `${tasks.length} task(s) in release`, blockers: [] };
}

function checkTaskStatus(tasks: TaskInfo[]): GateResult {
  const doneCats = new Set(releaseDoneCategories);
  const notDone = tasks.filter((t) => !doneCats.has(t.statusCategory));
  if (notDone.length > 0) {
    return {
      gate: "task_status",
      state: "failed",
      summary: `${notDone.length} task(s) not in done category`,
      blockers: notDone.map((t) => ({ jiraKey: t.jiraKey, reason: `status=${t.status} (${t.statusCategory})` })),
    };
  }
  return { gate: "task_status", state: "passed", summary: "All tasks are done", blockers: [] };
}

function checkCriticalBugs(tasks: TaskInfo[]): GateResult {
  const doneCats = new Set(releaseDoneCategories);
  const blockingPrios = new Set(releaseBlockingPriorities.map((p) => p.toLowerCase()));
  const openBugs = tasks.filter(
    (t) =>
      t.statusCategory !== "done" &&
      (t.statusCategory === "unknown" || !doneCats.has(t.statusCategory)) &&
      blockingPrios.has(t.priority.toLowerCase())
  );
  if (openBugs.length > 0) {
    return {
      gate: "critical_bugs",
      state: "failed",
      summary: `${openBugs.length} open Blocker/Critical bug(s)`,
      blockers: openBugs.map((t) => ({ jiraKey: t.jiraKey, reason: `priority=${t.priority}, status=${t.status}` })),
    };
  }
  return { gate: "critical_bugs", state: "passed", summary: "No open Blocker/Critical bugs", blockers: [] };
}

function checkDataFreshness(tasks: TaskInfo[]): GateResult {
  const maxAge = env.releaseDataFreshnessMinutes;
  const now = Date.now();
  const stale = tasks.filter((t) => {
    const age = now - t.lastSyncedAt.getTime();
    return age > maxAge * 60_000;
  });
  if (stale.length > 0) {
    return {
      gate: "data_freshness",
      state: "unknown",
      summary: `${stale.length} task(s) data older than ${maxAge} min`,
      blockers: stale.map((t) => ({ jiraKey: t.jiraKey, reason: `lastSyncedAt=${t.lastSyncedAt.toISOString()}` })),
    };
  }
  return { gate: "data_freshness", state: "passed", summary: "All data is fresh", blockers: [] };
}

function checkAiAdvisory(
  tasks: TaskInfo[],
  aiBlockers: { jiraKey: string; reason: string }[],
  aiAvailable: boolean
): GateResult {
  if (!aiAvailable) {
    return {
      gate: "ai_advisory",
      state: "unknown",
      summary: "AI unavailable — advisory only, does not affect mandatory gates",
      blockers: [],
    };
  }
  if (aiBlockers.length > 0) {
    return {
      gate: "ai_advisory",
      state: "passed",
      summary: `AI flagged ${aiBlockers.length} advisory blocker(s)`,
      blockers: aiBlockers,
    };
  }
  return { gate: "ai_advisory", state: "passed", summary: "AI found no blockers", blockers: [] };
}

function aggregateStatus(gates: GateResult[]): "ready" | "blocked" | "unknown" {
  const mandatory = gates.filter((g) => g.gate !== "ai_advisory");
  if (mandatory.some((g) => g.state === "failed")) return "blocked";
  if (mandatory.some((g) => g.state === "unknown")) return "unknown";
  return "ready";
}

/**
 * Run the release ready-check with fail-safe semantics:
 * - Empty release is always blocked (EMPTY_RELEASE)
 * - Unknown/stale data yields "unknown", never "ready"
 * - AI failure is advisory only, never makes a release ready
 * - Results are persisted to ReleaseCheck
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const release = await prisma.release.findUnique({
    where: { id },
    include: {
      tasks: {
        include: {
          issue: {
            select: {
              summary: true,
              description: true,
              priority: true,
              status: true,
              statusCategory: true,
              lastSyncedAt: true,
            },
          },
        },
      },
    },
  });
  if (!release) return NextResponse.json({ error: "not found" }, { status: 404 });

  const tasks: TaskInfo[] = release.tasks.map((t) => ({
    jiraKey: t.jiraKey,
    summary: t.issue.summary,
    description: t.issue.description,
    priority: t.issue.priority,
    status: t.issue.status,
    statusCategory: t.issue.statusCategory,
    lastSyncedAt: t.issue.lastSyncedAt,
  }));

  const gates: GateResult[] = [];

  gates.push(checkNonEmpty(tasks));

  if (tasks.length > 0) {
    gates.push(checkTaskStatus(tasks));
    gates.push(checkCriticalBugs(tasks));
    gates.push(checkDataFreshness(tasks));

    let aiBlockers: { jiraKey: string; reason: string }[] = [];
    let aiAvailable = false;
    try {
      const ai = await aiProvider.releaseCheck(
        { version: release.version },
        tasks.map((t) => ({
          jiraKey: t.jiraKey,
          summary: t.summary,
          description: t.description,
          priority: t.priority,
          status: t.status,
        }))
      );
      aiBlockers = ai.blockers;
      aiAvailable = true;
    } catch {
      aiAvailable = false;
    }
    gates.push(checkAiAdvisory(tasks, aiBlockers, aiAvailable));
  }

  const status = aggregateStatus(gates);
  const allBlockers = gates.flatMap((g) => g.blockers);

  await prisma.release.update({
    where: { id },
    data: { status: status as "ready" | "blocked" | "unknown" },
  });

  const summary = gates
    .map((g) => `${g.gate}=${g.state}`)
    .join(", ");

  await prisma.releaseCheck.create({
    data: {
      releaseId: id,
      triggeredBy: session.user?.email ?? null,
      status,
      summary,
      blockers: JSON.parse(JSON.stringify(allBlockers)) as object,
      sourceTimes: JSON.parse(JSON.stringify({
        checkedAt: new Date().toISOString(),
        taskLastSynced: tasks.map((t) => ({ key: t.jiraKey, at: t.lastSyncedAt.toISOString() })),
      })) as object,
    },
  });

  if (status === "blocked" || status === "unknown") {
    const reasons = allBlockers
      .slice(0, 10)
      .map((b) => (b.jiraKey ? `${b.jiraKey}: ${b.reason}` : b.reason));
    await notifyAll({
      type: "release",
      title: `Release ${release.version} ${status}`,
      body: reasons.join("; ") || summary,
      link: "/release",
    }).catch(() => null);
  }

  return NextResponse.json({
    status,
    ready: status === "ready",
    gates,
    blockers: allBlockers,
  });
}
