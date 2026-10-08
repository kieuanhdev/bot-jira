/**
 * Read-only diagnosis: why are a Jira project's Git branches not syncing?
 *
 * Usage (run against the environment you want to inspect):
 *   npx tsx --env-file=.env scripts/diagnose-git-sync.ts ECM
 *
 * Prints which stored accounts have Bitbucket/Jira tokens (names only), which
 * repos each can read, which of those look like the project's, the branch-scan
 * cursor/errors and how many branches/tasks exist. Never prints tokens; only GETs.
 */
import { prisma } from "../src/lib/prisma";
import { env, bitbucketRepoList } from "../src/lib/env";
import { safeDecrypt } from "../src/lib/crypto";
import { listReposForCred } from "../src/lib/bitbucket/client";
import { listJiraCreds, discoverJiraProjectAccess } from "../src/lib/jira/project-access";

async function main() {
  const project = (process.argv[2] ?? "").toUpperCase();
  if (!project) throw new Error("Usage: diagnose-git-sync.ts <PROJECT_KEY>");
  const needle = project.toLowerCase();

  console.log(`== Diagnosing ${project} ==`);
  console.log("BITBUCKET_AUTO_DISCOVER:", env.bitbucketAutoDiscover, "| JIRA_AUTO_DISCOVER:", env.jiraAutoDiscover);
  console.log("Bitbucket base:", env.bitbucketBaseUrl ? new URL(env.bitbucketBaseUrl).host : "(not set)");

  // 1. migration applied?
  try {
    const links = await prisma.branchIssueLink.count();
    console.log("BranchIssueLink table: OK,", links, "rows");
  } catch {
    console.log("BranchIssueLink table: MISSING -> run `npx prisma migrate deploy` (branch scan fails without it)");
  }

  // 2. accounts with Bitbucket tokens and what each can read
  const users = await prisma.user.findMany({
    where: { bitbucketTokenEnc: { not: null } },
    select: { jiraUsername: true, email: true, bitbucketUserEnc: true, bitbucketTokenEnc: true },
  });
  console.log(`\nUsers with a Bitbucket token: ${users.length}`);
  const creds = [
    ...(env.bitbucketUser && env.bitbucketToken ? [{ label: "system(.env)", user: env.bitbucketUser, token: env.bitbucketToken }] : []),
    ...users.flatMap((u) => {
      const user = safeDecrypt(u.bitbucketUserEnc);
      const token = safeDecrypt(u.bitbucketTokenEnc);
      return user && token ? [{ label: u.jiraUsername ?? u.email ?? user, user, token }] : [];
    }),
  ];
  const allRepos = new Set<string>();
  for (const c of creds) {
    const repos = await listReposForCred({ user: c.user, token: c.token });
    repos.forEach((r) => allRepos.add(r));
    const mine = repos.filter((r) => r.toLowerCase().includes(needle));
    console.log(` - ${c.label}: reads ${repos.length} repos; matching "${project}": ${mine.join(", ") || "none"}`);
  }
  const unscanned = [...allRepos].filter((r) => !bitbucketRepoList.map((x) => x.toLowerCase()).includes(r.toLowerCase()));
  console.log(`Repos readable by some account but not in BITBUCKET_REPOS (scanned only via auto-discovery): ${unscanned.length}`);

  // 3. what the branch scan last did
  const cur = await prisma.integrationCursor.findFirst({ where: { integration: "bitbucket", scope: "branches" } });
  console.log("\nBranch scan cursor:", cur
    ? { lastStartedAt: cur.lastStartedAt, lastSuccessAt: cur.lastSuccessAt, lastError: cur.lastError?.slice(0, 300) ?? null, stats: cur.stats }
    : "none (worker never ran?)");

  // 4. data present for the project
  const issues = await prisma.issueCache.count({ where: { projectKey: project, deletedAt: null } });
  const links = await prisma.branchIssueLink.count({ where: { jiraKey: { startsWith: `${project}-` }, linkState: "confirmed" } }).catch(() => -1);
  const named = await prisma.branchInfo.count({ where: { deletedAt: null, OR: [{ branch: { contains: `${project}-`, mode: "insensitive" } }, { prTitle: { contains: `${project}-`, mode: "insensitive" } }] } });
  const reposInDb = await prisma.branchInfo.groupBy({ by: ["repo"], where: { deletedAt: null, repo: { contains: needle, mode: "insensitive" } }, _count: true });
  console.log(`\nTasks in cache: ${issues} | branches linked to ${project}-*: ${links} | branches/PRs mentioning ${project}-: ${named}`);
  console.log("Repos in DB matching name:", reposInDb.map((r) => `${r.repo}(${r._count})`).join(", ") || "none");

  // 5. Jira side
  const jiraCreds = await listJiraCreds();
  const access = await discoverJiraProjectAccess(true);
  const cat = await prisma.jiraProject.findUnique({ where: { key: project } });
  console.log(`\nJira accounts stored: ${jiraCreds.map((c) => c.label).join(", ") || "none"}`);
  console.log(`${project} in catalog: ${Boolean(cat?.active)} | readable by: ${access.get(project)?.label ?? "NO stored account"}`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
