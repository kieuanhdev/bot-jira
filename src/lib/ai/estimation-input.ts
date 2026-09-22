import { prisma } from "@/lib/prisma";
import type { AiScoreInput } from "@/lib/ai/prompts";

type ImpactFlags = NonNullable<AiScoreInput["impact"]>;

const RE = {
  backend: /backend|server|api|endpoint|rest|service|worker|cron|database|db/i,
  frontend: /frontend|front-?end|ui|ux|react|next|screen|page|view|widget/i,
  mobile: /mobile|ios|android|flutter|react native|app|client|device/i,
  migration: /migration|migrate|schema|alter table|new table|db change|database chang/i,
  tests: /test|qa|coverage|unit test|integration test|regression/i,
  migrationLabel: /^migration:|^db-?change:?/i,
  testLabel: /^(unit-)?test(?:ing)?:?/i,
};

/** Detect acceptance criteria lines in a Jira description. */
export function extractAcceptanceCriteria(description: string): string[] {
  const lines = description.split(/\r?\n/);
  const out: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-*]\s*/, "");
    if (/acceptance\s*criteria/i.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (!trimmed) continue;
      // A new bold/heading section ends the AC block.
      if (/^[\w\s/ ]+:$/.test(trimmed) && !/acceptance/i.test(trimmed)) {
        inBlock = out.length > 0 ? false : inBlock;
      }
      out.push(trimmed);
      if (out.length >= 10) break;
    }
  }
  return out;
}

/** Extract dependency issue keys (e.g. "Depends on PROJ-12, PROJ-34" or "blocker: PROJ-12"). */
export function extractDependencies(description: string, summary: string): string[] {
  const text = `${summary}\n${description}`;
  const matches = text.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? [];
  return [...new Set(matches)];
}

function impactFromLabels(labels: string[]): Partial<ImpactFlags> {
  const flags: Partial<ImpactFlags> = {};
  for (const raw of labels) {
    const label = raw.trim().toLowerCase();
    if (/^backend/.test(label) || /^api/.test(label)) flags.backend = true;
    if (/^frontend|^front-?end|^ui/.test(label)) flags.frontend = true;
    if (/^mobile|^ios|^android|^flutter/.test(label)) flags.mobile = true;
    if (RE.migrationLabel.test(label) || /^db-?change/.test(label)) flags.migration = true;
    if (RE.testLabel.test(label)) flags.tests = true;
  }
  return flags;
}

function impactFromText(text: string): Partial<ImpactFlags> {
  const flags: Partial<ImpactFlags> = {};
  if (RE.backend.test(text)) flags.backend = true;
  if (RE.frontend.test(text)) flags.frontend = true;
  if (RE.mobile.test(text)) flags.mobile = true;
  if (RE.migration.test(text)) flags.migration = true;
  if (RE.tests.test(text)) flags.tests = true;
  return flags;
}

/**
 * Merge label-derived and text-derived impact flags. Text is a fallback; an
 * explicit label wins.
 */
export function deriveImpact(
  labels: string[],
  summary: string,
  description: string
): ImpactFlags {
  const fromLabels = impactFromLabels(labels);
  const fromText = impactFromText(`${summary}\n${description}`);
  return {
    backend: fromLabels.backend ?? fromText.backend ?? false,
    frontend: fromLabels.frontend ?? fromText.frontend ?? false,
    mobile: fromLabels.mobile ?? fromText.mobile ?? false,
    migration: fromLabels.migration ?? fromText.migration ?? false,
    tests: fromLabels.tests ?? fromText.tests ?? false,
  };
}

/**
 * Find historical similar tasks: same project + same issue type + a finished
 * issue with points, ranked by summary similarity (shared significant words).
 * Used as anchors for the estimate (M7-01).
 */
export async function findSimilarTasks(
  projectKey: string,
  type: string,
  summary: string,
  limit = 3
): Promise<{ key: string; points: number; summary: string }[]> {
  if (!projectKey || !summary.trim()) return [];
  const candidates = await prisma.issueCache.findMany({
    where: {
      projectKey,
      type,
      points: { not: null },
      statusCategory: { in: ["done"] },
    },
    select: { jiraKey: true, summary: true, points: true },
    take: 200,
  });
  const words = significantWords(summary);
  if (words.length === 0) return [];
  return candidates
    .map((c) => {
      const cw = significantWords(c.summary);
      const overlap = words.filter((w) => cw.includes(w)).length;
      return { ...c, score: overlap / words.length };
    })
    .filter((c) => c.score > 0 && c.points != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ jiraKey, points, summary }) => ({ key: jiraKey, points: points as number, summary }));
}

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !["user", "page", "task", "issue", "make", "with"].includes(w));
}

/**
 * Build the full, normalized AI estimation input from a cached issue (M7-01).
 */
export async function buildEstimateInput(opts: {
  key: string;
  summary: string;
  description: string;
  type?: string;
  priority?: string;
  labels?: string[];
  projectKey?: string;
}): Promise<AiScoreInput> {
  const { key, summary, description, type, priority, labels = [], projectKey = "" } = opts;
  return {
    key,
    summary,
    description,
    type,
    priority,
    impact: deriveImpact(labels, summary, description),
    acceptanceCriteria: extractAcceptanceCriteria(description),
    dependencies: extractDependencies(description, summary),
    similarTasks: await findSimilarTasks(projectKey, type ?? "", summary),
  };
}
