import { pointScale, defaultPoint } from "@/lib/env";

export type AiScoreInput = {
  key: string;
  summary: string;
  description: string;
  type?: string;
  priority?: string;
};

export type AiScoreOutput = {
  points: number;
  reasoning: string;
  risks: string[];
};

export type AiReleaseCheckOutput = {
  ready: boolean;
  blockers: { jiraKey: string; reason: string }[];
};

export function buildScorePrompt(input: AiScoreInput) {
  const scale = (pointScale as number[]).join("/");
  return `You are an experienced engineering lead estimating story points.

Available point values: ${scale}. Pick ONE value from that list.

Task:
Key: ${input.key}
Type: ${input.type ?? "unknown"}
Priority: ${input.priority ?? "unknown"}
Summary: ${input.summary}
Description:
${input.description || "(no description)"}

Respond with ONLY a JSON object (no markdown, no code fences, no extra text) with exactly these keys:
{
  "points": <number from the list ${scale}>,
  "reasoning": "<one or two sentences explaining the estimate>",
  "risks": ["<short risk>", ...]  // may be empty
}

If the description is thin, estimate from the summary and note the uncertainty in reasoning.`;
}

/** Parse a possibly-messy LLM reply into a clean AiScoreOutput. */
export function parseAiScore(raw: string): AiScoreOutput {
  // Strip code fences if present.
  const text = raw.trim().replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  // Grab the first {...} block.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let parsed: unknown = null;
  if (start >= 0 && end > start) {
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI did not return valid JSON");
  }
  const obj = parsed as Record<string, unknown>;
  const scale = pointScale as number[];
  let points = Number(obj.points);
  if (!Number.isFinite(points) || !scale.includes(points)) {
    // Snap to nearest allowed value; if unparseable, use default.
    if (Number.isFinite(points) && scale.length) {
      points = scale.reduce((a, b) =>
        Math.abs(b - points) < Math.abs(a - points) ? b : a
      );
    } else {
      points = defaultPoint;
    }
  }
  return {
    points,
    reasoning: String(obj.reasoning ?? ""),
    risks: Array.isArray(obj.risks) ? obj.risks.map(String) : [],
  };
}

export function parseReleaseCheck(raw: string, keys: string[]): AiReleaseCheckOutput {
  const text = raw.trim().replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let parsed: unknown = null;
  if (start >= 0 && end > start) {
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== "object") {
    return { ready: true, blockers: [] };
  }
  const obj = parsed as Record<string, unknown>;
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
