import { prisma } from "@/lib/prisma";
import { registerJobs, stopBoss } from "@/lib/queue/boss";

let stopping = false;

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.info(JSON.stringify({ level: "info", message: "worker stopping", signal }));
  await stopBoss().catch((error) => {
    console.error(JSON.stringify({ level: "error", message: "pg-boss stop failed", error: String(error) }));
  });
  await prisma.$disconnect().catch(() => null);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

registerJobs()
  .then(() => console.info(JSON.stringify({ level: "info", message: "worker started" })))
  .catch(async (error) => {
    console.error(JSON.stringify({ level: "error", message: "worker failed to start", error: String(error) }));
    await prisma.$disconnect().catch(() => null);
    process.exit(1);
  });
