/**
 * Parse a free-form inbox command into a structured transition request.
 *
 * Supported forms (case-insensitive):
 *   MOVE PROJ-123 TO In Progress
 *   DONE PROJ-124
 *   CLOSE PROJ-125
 *   REOPEN PROJ-126
 *
 * A single line may contain multiple comma-separated keys for the same verb:
 *   MOVE PROJ-1, PROJ-2 TO Done
 *
 * Anything that doesn't match returns ok:false with a reason (not an exception).
 */

export type ParsedCommand = {
  ok: boolean;
  reason?: string;
  keys: string[];
  status: string;
  raw: string;
};

const KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

const VERB_TO_STATUS: Record<string, string> = {
  done: "Done",
  close: "Closed",
  reopen: "To Do",
  todo: "To Do",
  resolve: "Resolved",
};

/** Extract all Jira-style keys from a string. */
export function extractKeys(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(KEY_RE)) found.push(m[1]);
  // de-dup, preserve order
  return Array.from(new Set(found));
}

export function parseCommand(raw: string): ParsedCommand {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "empty command", keys: [], status: "", raw };

  const upper = text.toUpperCase();

  // "DONE KEY" / "CLOSE KEY" / "REOPEN KEY" / "RESOLVE KEY"
  for (const verb of Object.keys(VERB_TO_STATUS)) {
    if (upper.startsWith(verb.toUpperCase()) && /\s/.test(upper)) {
      const rest = text.slice(verb.length);
      const keys = extractKeys(rest);
      if (keys.length > 0) {
        return { ok: true, keys, status: VERB_TO_STATUS[verb], raw };
      }
    }
  }

  // "MOVE KEY TO <status>"
  const moveMatch = text.match(/^(?:MOVE|SET)\s+(.*?)\s+TO\s+(.+)$/i);
  if (moveMatch) {
    const keys = extractKeys(moveMatch[1]);
    const status = moveMatch[2].trim();
    if (keys.length > 0 && status) {
      return { ok: true, keys, status, raw };
    }
    return { ok: false, reason: "could not find key or target status", keys, status, raw };
  }

  // "KEY -> status" or "KEY: status"
  const arrowMatch = text.match(/^([A-Z][A-Z0-9]+-\d+)\s*(?:->|:)\s*(.+)$/i);
  if (arrowMatch) {
    return { ok: true, keys: [arrowMatch[1]], status: arrowMatch[2].trim(), raw };
  }

  return {
    ok: false,
    reason: 'unrecognized. Try "MOVE PROJ-1 TO In Progress" or "DONE PROJ-2"',
    keys: extractKeys(text),
    status: "",
    raw,
  };
}
