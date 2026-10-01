/**
 * Read-only audit script for refresh-board-membership jobs in pg-boss.
 * Run with: node --import tsx scripts/audit-board-membership-jobs.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=== Auditing 'refresh-board-membership' jobs in pgboss.job ===");
  try {
    const counts = await prisma.$queryRaw<Array<{ state: string; count: bigint }>>`
      SELECT state, count(*) as count
      FROM pgboss.job
      WHERE name = 'refresh-board-membership'
      GROUP BY state
      ORDER BY state;
    `;

    console.log("Job status summary:");
    let total = BigInt(0);
    for (const row of counts) {
      console.log(` - ${row.state}: ${row.count.toString()}`);
      total += BigInt(row.count);
    }
    console.log(`Total jobs: ${total.toString()}`);

    const ageSummary = await prisma.$queryRaw<Array<{ min_created: Date; max_created: Date }>>`
      SELECT min(createdon) as min_created, max(createdon) as max_created
      FROM pgboss.job
      WHERE name = 'refresh-board-membership' AND state = 'created';
    `;

    if (ageSummary && ageSummary[0] && ageSummary[0].min_created) {
      console.log("\nUnstarted ('created') jobs age:");
      console.log(` - Oldest createdon: ${ageSummary[0].min_created.toISOString()}`);
      console.log(` - Newest createdon: ${ageSummary[0].max_created.toISOString()}`);
    }
  } catch (err: unknown) {
    console.error("Error querying pgboss.job:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
