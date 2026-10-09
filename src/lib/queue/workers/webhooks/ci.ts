import { prisma } from "@/lib/prisma";

type CiStatus = "pending" | "success" | "failed" | "cancelled";

type CiWebhookPayload = {
  runId?: string | number;
  run_id?: string | number;
  status?: string;
  testStatus?: string;
  branch?: string;
  commit?: string;
  repo?: string;
  url?: string;
  provider?: string;
  startedAt?: string;
  completedAt?: string;
};

export function normalizeCiStatus(status?: string): CiStatus {
  const normalized = (status ?? "").toLowerCase();
  if (/success|passed|pass|succeeded|ok/.test(normalized)) return "success";
  if (/fail|error|failed/.test(normalized)) return "failed";
  if (/cancel|aborted|stopped/.test(normalized)) return "cancelled";
  return "pending";
}

export async function handleCiWebhook(
  payload: unknown
): Promise<Record<string, unknown>> {
  const webhook = payload as CiWebhookPayload;
  const repo = webhook.repo ?? "default";
  const branch = webhook.branch ?? "";
  const commit = webhook.commit ?? "";
  const runId = String(webhook.runId ?? webhook.run_id ?? "");
  if (!runId || !commit) {
    return { skipped: true, reason: "no runId or commit" };
  }

  const externalId = `${webhook.status ?? "event"}:${repo}:${commit}:${runId}`;
  const status = normalizeCiStatus(webhook.status);
  await prisma.ciBuildStatus.upsert({
    where: {
      provider_externalId: { provider: webhook.provider ?? "ci", externalId },
    },
    create: {
      provider: webhook.provider ?? "ci",
      externalId,
      repo,
      branch,
      commitSha: commit,
      status,
      testStatus: webhook.testStatus ?? null,
      url: webhook.url ?? null,
      startedAt: webhook.startedAt ? new Date(webhook.startedAt) : null,
      completedAt: webhook.completedAt ? new Date(webhook.completedAt) : null,
    },
    update: {
      status,
      testStatus: webhook.testStatus ?? null,
      url: webhook.url ?? null,
      completedAt: webhook.completedAt ? new Date(webhook.completedAt) : new Date(),
    },
  });

  let notified = false;
  if (status !== "pending") {
    const { notifyAll } = await import("@/lib/notify");
    const statusText =
      status === "success"
        ? "thành công"
        : status === "failed"
          ? "thất bại"
          : "đã bị hủy";
    await notifyAll({
      type: "ci",
      title: `CI ${repo}${branch ? ` / ${branch}` : ""} ${statusText}`,
      body: `Commit ${commit.slice(0, 12)} · run ${runId}`,
      link: webhook.url ?? "/release",
      severity:
        status === "success" ? "success" : status === "failed" ? "danger" : "warning",
      eventKey: `ci:${externalId}`,
    });
    notified = true;
  }
  return { upserted: externalId, status, notified };
}
