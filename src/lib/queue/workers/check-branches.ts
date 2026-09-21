import { prisma } from "@/lib/prisma";
import { bitbucket } from "@/lib/bitbucket/client";
import { guard, hasBitbucketConfig } from "../guard";
import type { WorkerLog } from "../guard";

export async function runCheckBranches(): Promise<WorkerLog> {
  if (!hasBitbucketConfig()) return guard(hasBitbucketConfig(), "Bitbucket not configured");
  const errors: string[] = [];
  let checked = 0;
  for (const repo of bitbucket.repos()) {
    try {
      const status = await bitbucket.branchStatus(repo);
      for (const s of status) {
        await prisma.branchInfo.upsert({
          where: { repo_branch: { repo, branch: s.branch.name } },
          update: {
            lastCommitAt: s.branch.latestCommitDate
              ? new Date(s.branch.latestCommitDate)
              : undefined,
            prId: s.pr?.id,
            prState: s.prState ?? null,
            prDestinationBranch: s.prDestinationBranch ?? null,
            merged: s.merged,
            checkedAt: new Date(),
          },
          create: {
            repo,
            branch: s.branch.name,
            lastCommitAt: s.branch.latestCommitDate
              ? new Date(s.branch.latestCommitDate)
              : undefined,
            prId: s.pr?.id,
            prState: s.prState ?? null,
            prDestinationBranch: s.prDestinationBranch ?? null,
            merged: s.merged,
            checkedAt: new Date(),
          },
        });
        checked++;
      }
    } catch (e) {
      errors.push(`${repo}: ${(e as Error).message}`);
    }
  }
  return { ok: true, stats: { checked } as unknown as Record<string, number>, errors };
}
