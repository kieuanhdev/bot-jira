import { pointScale } from "@/lib/env";

/** M7 — which prompt version produced an estimate; stored per score. */
export const AI_PROMPT_VERSION = "estimate-v2";

// ---------------------------------------------------------------------------
// M7-01 — Normalized estimation input
// ---------------------------------------------------------------------------

export type AiScoreInput = {
  key: string;
  summary: string;
  description: string;
  type?: string;
  priority?: string;
  /**
   * Impact flags collected from labels / description. Drives the rubric so
   * the estimate accounts for cross-platform, schema and testing work.
   */
  impact?: {
    backend?: boolean;
    frontend?: boolean;
    mobile?: boolean;
    migration?: boolean;
    tests?: boolean;
  };
  /** Acceptance criteria, if the description carries them (M7-01). */
  acceptanceCriteria?: string[];
  /** Known dependency issue keys (M7-01). */
  dependencies?: string[];
  /** Historical similar tasks to anchor the estimate (M7-01). */
  similarTasks?: { key: string; points: number; summary: string }[];
};

// ---------------------------------------------------------------------------
// M7-02 — Explainable estimation output
// ---------------------------------------------------------------------------

export type AiScoreOutput = {
  /** Suggested story points (from the configured scale). */
  suggestedPoints: number;
  /** 0..1 — how confident the model is in the suggestion. */
  confidence: number;
  reasoning: string;
  /** Things the task is missing that make the estimate uncertain. */
  missingInformation: string[];
  risks: string[];
  /** Keys of historically similar tasks used as anchors (if any). */
  similarTasks: string[];
};

export type AiReleaseCheckOutput = {
  ready: boolean;
  blockers: { jiraKey: string; reason: string }[];
};

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function impactLine(input: AiScoreInput): string {
  const i = input.impact;
  if (!i) return "unknown";
  const parts = [
    i.backend ? "backend" : null,
    i.frontend ? "frontend" : null,
    i.mobile ? "mobile" : null,
    i.migration ? "db-migration" : null,
    i.tests ? "tests-required" : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "unspecified";
}

function similarTasksLine(input: AiScoreInput): string {
  const t = input.similarTasks;
  if (!t || t.length === 0) return "(none available)";
  return t
    .map((x) => `- ${x.key} [${x.points}pt] ${x.summary}`)
    .join("\n");
}

export function buildScorePrompt(input: AiScoreInput): string {
  const scale = (pointScale as number[]).join("/");
  const criteria =
    input.acceptanceCriteria?.length
      ? input.acceptanceCriteria.map((c) => `- ${c}`).join("\n")
      : "(not provided)";
  const deps =
    input.dependencies?.length
      ? input.dependencies.join(", ")
      : "(none listed)";

  return `You are an experienced engineering lead estimating story points for a team task.

Available point values: ${scale}. Pick ONE value from that list.

Task:
Key: ${input.key}
Type: ${input.type ?? "unknown"}
Priority: ${input.priority ?? "unknown"}
Summary: ${input.summary}
Description:
${input.description || "(no description)"}

Acceptance criteria:
${criteria}

Known dependencies: ${deps}
Expected impact: ${impactLine(input)}

Historically similar tasks (anchor your estimate to these where they match):
${similarTasksLine(input)}

Guidance:
- Larger scope, more platforms, or a database migration => higher points.
- If acceptance criteria or the description are thin, lower your confidence and list what is missing in missingInformation.
- Weigh the similar tasks heavily; if this task is clearly bigger/smaller, explain why in reasoning.

Respond with ONLY a JSON object (no markdown, no code fences, no extra text) with exactly these keys:
{
  "suggestedPoints": <number from the list ${scale}>,
  "confidence": <number between 0 and 1>,
  "reasoning": "<one or two sentences explaining the estimate>",
  "missingInformation": ["<what is missing>", ...],  // may be empty
  "risks": ["<short risk>", ...],  // may be empty
  "similarTasks": ["<jira key from the similar list>", ...]  // may be empty, only keys you actually used
}`;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim().replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Parse a possibly-messy LLM reply into a clean AiScoreOutput. Throws when unusable. */
export function parseAiScore(raw: string): AiScoreOutput {
  const obj = extractJsonObject(raw);
  if (!obj) throw new Error("AI did not return valid JSON");
  const scale = pointScale as number[];

  let points = Number(obj.suggestedPoints ?? obj.points);
  if (!Number.isFinite(points)) throw new Error("AI returned no valid points");
  if (!scale.includes(points)) {
    points = scale.reduce((a, b) =>
      Math.abs(b - points) < Math.abs(a - points) ? b : a
    );
  }

  const rawConfidence = Number(obj.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.min(1, Math.max(0, rawConfidence))
    : 0.5;

  return {
    suggestedPoints: points,
    confidence,
    reasoning: String(obj.reasoning ?? ""),
    missingInformation: Array.isArray(obj.missingInformation)
      ? obj.missingInformation.map(String)
      : [],
    risks: Array.isArray(obj.risks) ? obj.risks.map(String) : [],
    similarTasks: Array.isArray(obj.similarTasks)
      ? obj.similarTasks.map(String).filter(Boolean)
      : [],
  };
}

export function parseReleaseCheck(raw: string, keys: string[]): AiReleaseCheckOutput {
  const obj = extractJsonObject(raw);
  if (!obj) return { ready: true, blockers: [] };
  const rawBlockers = Array.isArray(obj.blockers) ? obj.blockers : [];
  const keySet = new Set(keys);
  const blockers = (rawBlockers as { jiraKey?: string; reason?: string }[])
    .filter((b) => b && keySet.has(b.jiraKey ?? ""))
    .map((b) => ({ jiraKey: b.jiraKey!, reason: String(b.reason ?? "") }));
  return {
    ready: obj.ready === false ? false : blockers.length === 0,
    blockers,
  };
}

export function buildReleaseCheckPrompt(
  release: { version: string },
  tasks: { jiraKey: string; summary: string; description: string; priority?: string; status?: string }[]
): string {
  const list = tasks
    .map(
      (t) =>
        `- ${t.jiraKey} [${t.status ?? "?"} | priority ${t.priority ?? "?"}] ${t.summary}`
    )
    .join("\n");
  return `You are a release manager deciding if a release can ship.

Release version: ${release.version}

Tasks in this release:
${list}

Based ONLY on the summaries and priorities above, identify any task that looks like a critical/blocking bug or a risk that would prevent release. 

Respond with ONLY a JSON object (no markdown):
{
  "ready": <boolean>,
  "blockers": [ { "jiraKey": "<one of the keys above>", "reason": "<short reason>" } ]
}

Set ready to false only if there is a genuine blocker. Be conservative.`;
}
