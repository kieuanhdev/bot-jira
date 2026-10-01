/**
 * Controlled cleanup script for unstarted ('created') refresh-board-membership jobs in pg-boss.
 * Requires explicit '--confirm' argument from operator.
 * Run with: node --import tsx scripts/cleanup-board-membership-jobs.ts --confirm
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const isConfirmed = process.argv.includes("--confirm");

  console.log("=== Cleanup 'refresh-board-membership' jobs ===");

  if (!isConfirmed) {
    console.warn("SAFETY CHECK: Missing '--confirm' argument.");
    console.log("To safely delete unstarted 'created' jobs for queue 'refresh-board-membership', run:");
    console.log("  node --import tsx scripts/cleanup-board-membership-jobs.ts --confirm");
    process.exit(1);
  }

  try {
    const beforeCounts = await prisma.$queryRaw<Array<{ state: string; count: bigint }>>`
      SELECT state, count(*) as count
      FROM pgboss.job
      WHERE name = 'refresh-board-membership'
      GROUP BY state;
    `;
    console.log("Before cleanup counts:", beforeCounts);

    // Delete ONLY jobs with name = 'refresh-board-membership' and state = 'created'
    const deletedCount = await prisma.$executeRaw`
      DELETE FROM pgboss.job
      WHERE name = 'refresh-board-membership' AND state = 'created';
    `;

    console.log(`Successfully deleted ${deletedCount} unstarted ('created') jobs.`);

    const afterCounts = await prisma.$queryRaw<Array<{ state: string; count: bigint }>>`
      SELECT state, count(*) as count
      FROM pgboss.job
      WHERE name = 'refresh-board-membership'
      GROUP BY state;
    `;
    console.log("After cleanup counts:", afterCounts);
  } catch (err: unknown) {
    console.error("Error executing cleanup:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
