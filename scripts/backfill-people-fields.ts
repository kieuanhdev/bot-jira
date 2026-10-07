import { prisma } from "../src/lib/prisma";
import { listSyncEnabledProjectKeys } from "../src/lib/jira/project-catalog";
import { enqueueJiraProjectSync, stopBoss } from "../src/lib/queue/boss";

async function main() {
  const requested = process.argv.slice(2).map((key) => key.trim().toUpperCase()).filter(Boolean);
  const projects = requested.length > 0 ? requested : await listSyncEnabledProjectKeys();
  for (const projectKey of projects) {
    const jobId = await enqueueJiraProjectSync({ projectKey, full: true, source: "admin" });
    console.info(`${projectKey}: ${jobId ? `queued ${jobId}` : "already queued"}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopBoss().catch(() => undefined);
    await prisma.$disconnect();
  });
