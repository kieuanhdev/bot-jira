import { prisma } from "@/lib/prisma";
import { registerJobs, stopBoss } from "@/lib/queue/boss";
import { writeWorkerHeartbeat } from "@/lib/health/worker-health";
import { validateWorkerStartup } from "@/lib/health/config-validation";

let stopping = false;
let heartbeat: NodeJS.Timeout | null = null;

// OPS-01 — write a liveness heartbeat on a cadence shorter than the "down"
// threshold (2 min) so a wedged process is distinguishable from a crashed one
// even when every individual job is idle/skipped.
const HEARTBEAT_INTERVAL_MS = 30_000;

function startHeartbeat() {
  heartbeat = setInterval(() => {
    void writeWorkerHeartbeat().catch(() => null);
  }, HEARTBEAT_INTERVAL_MS);
  // Don't keep the event loop alive for the timer alone.
  if (typeof heartbeat.unref === "function") heartbeat.unref();
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.info(JSON.stringify({ level: "info", message: "worker stopping", signal }));
  if (heartbeat) clearInterval(heartbeat);
  await stopBoss().catch((error) => {
    console.error(JSON.stringify({ level: "error", message: "pg-boss stop failed", error: String(error) }));
  });
  await prisma.$disconnect().catch(() => null);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// OPS-02 — fail fast when the worker's required config or Jira timing config is
// invalid/missing. We log only the names of the missing variables / error messages,
// never values, so the process exits non-zero and the orchestrator can alert on the crash.
const configErrors = validateWorkerStartup();
if (configErrors.length > 0) {
  console.error(
    JSON.stringify({
      level: "error",
      message: "worker configuration validation failed",
      errors: configErrors,
    })
  );
  process.exit(1);
}

// OPS-01 / Healthcheck: Do not start heartbeat before registerJobs finishes.
// Starting heartbeat early creates false-positives if pg-boss or migrations hang.
registerJobs()
  .then(async () => {
    // 1. Record first heartbeat
    await writeWorkerHeartbeat().catch(() => null);
    // 2. Start heartbeat interval
    startHeartbeat();
    // 3. Log worker ready
    console.info(JSON.stringify({ level: "info", message: "worker ready" }));
  })
  .catch(async (error) => {
    console.error(JSON.stringify({ level: "error", message: "worker failed to start", error: String(error) }));
    if (heartbeat) clearInterval(heartbeat);
    await prisma.$disconnect().catch(() => null);
    process.exit(1);
  });
