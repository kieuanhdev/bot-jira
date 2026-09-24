import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { resolveBranchLink } from "../src/lib/bitbucket/branch-linker";

async function main() {
  console.log("Starting branch link backfill...");
  const startTime = Date.now();

  // Load all active keys from IssueCache
  const issues = await prisma.issueCache.findMany({
    select: { jiraKey: true },
  });
  const validKeys = new Set(issues.map((i) => i.jiraKey));
  console.log(`Loaded ${validKeys.size} issues from IssueCache`);

  // Load all BranchInfo
  const branches = await prisma.branchInfo.findMany();
  console.log(`Loaded ${branches.length} branches from BranchInfo`);

  let autoLinked = 0;
  let suggested = 0;
  let preserved = 0;
  let unlinked = 0;

  for (const b of branches) {
    if (b.linkSource === "manual" || b.linkSource === "explicit") {
      preserved++;
      continue;
    }

    const resolved = resolveBranchLink({
      branch: b.branch,
      prTitle: b.prTitle,
      existingJiraKey: b.jiraKey,
      existingLinkSource: b.linkSource,
      validJiraKeys: validKeys,
    });

    if (resolved.jiraKey && resolved.linkConfidence === 95) {
      autoLinked++;
    } else if (resolved.suggestedJiraKey) {
      suggested++;
    } else {
      unlinked++;
    }

    await prisma.branchInfo.update({
      where: { id: b.id },
      data: {
        jiraKey: resolved.jiraKey,
        linkSource: resolved.linkSource,
        linkConfidence: resolved.linkConfidence,
        suggestedJiraKey: resolved.suggestedJiraKey,
      },
    });
  }

  const durationMs = Date.now() - startTime;
  console.log("==========================================");
  console.log("Branch Link Backfill Summary:");
  console.log(`  Total branches: ${branches.length}`);
  console.log(`  Auto-linked (confidence 95): ${autoLinked}`);
  console.log(`  Suggested (review needed): ${suggested}`);
  console.log(`  Unlinked: ${unlinked}`);
  console.log(`  Preserved (manual/explicit): ${preserved}`);
  console.log(`  Duration: ${(durationMs / 1000).toFixed(2)}s`);
  console.log("==========================================");
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
