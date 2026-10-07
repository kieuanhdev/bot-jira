/**
 * Read-only probe: find which projects expose the "people" custom fields
 * (Approver, Assignee Tester, Reporter) and what their ids / types are.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/probe-people-fields.ts            # all active projects
 *   npx tsx --env-file=.env scripts/probe-people-fields.ts EPM-123    # one issue, with values
 *
 * Uses the app's own Jira credentials; never prints the token. Only GETs.
 */
import { getSystemJiraAuth, jiraWith } from "../src/lib/jira/client";
import type { JiraEditField } from "../src/lib/jira/types";

const PEOPLE = /^(approver|assignee tester|tester|reporter)$/i;

type Hit = { id: string; name: string; field: JiraEditField };

function peopleFields(meta: Record<string, JiraEditField>): Hit[] {
  return Object.entries(meta)
    .filter(([, f]) => PEOPLE.test((f.name ?? "").trim()))
    .map(([id, field]) => ({ id, name: field.name, field }));
}

function describe(h: Hit): string {
  const s = h.field.schema ?? {};
  const kind = s.type === "array" ? `array<${(s as { items?: string }).items ?? "?"}>` : (s.type ?? "?");
  return `${h.name.padEnd(16)} ${h.id.padEnd(18)} ${kind}${s.custom ? `  [${s.custom.split(":").pop()}]` : ""}`;
}

async function main() {
  const auth = (await getSystemJiraAuth()) ?? undefined;
  const jira = jiraWith(auth);
  const arg = process.argv[2]?.trim().toUpperCase();

  if (arg && arg.includes("-")) {
    const [meta, issue] = await Promise.all([jira.getEditMeta(arg), jira.getIssue(arg, "reporter")]);
    const hits = peopleFields(meta.fields ?? {});
    const ids = hits.map((h) => h.id).join(",");
    const withValues = await jira.getIssue(arg, ids || "reporter");
    console.log(`${arg}  (${issue.fields.project?.key})`);
    for (const h of hits) {
      const v = withValues.fields[h.id];
      const names = (Array.isArray(v) ? v : v ? [v] : []).map(
        (u: { name?: string; displayName?: string }) => u.name ?? u.displayName
      );
      console.log(`  ${describe(h)}  =>  ${names.join(", ") || "(empty)"}`);
    }
    if (!hits.length) console.log("  (no matching editable fields)");
    return;
  }

  const projects = await jira.getProjects();
  for (const p of projects) {
    try {
      const res = await jira.search(`project = "${p.key}" ORDER BY updated DESC`, 1);
      const sample = res.issues[0]?.key;
      if (!sample) {
        console.log(`${p.key.padEnd(8)} (no issues)`);
        continue;
      }
      const meta = await jira.getEditMeta(sample);
      const hits = peopleFields(meta.fields ?? {});
      console.log(`${p.key.padEnd(8)} sample=${sample}`);
      for (const h of hits) console.log(`    ${describe(h)}`);
      if (!hits.length) console.log("    (none)");
    } catch (e) {
      console.log(`${p.key.padEnd(8)} ERROR ${(e as Error).message.slice(0, 100)}`);
    }
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
