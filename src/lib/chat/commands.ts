/**
 * M6-03 — Chat command parser.
 *
 * Pure, rule-based parsing of chat commands into a normalized `ChatCommand`.
 * The parser never executes anything; it only classifies intent so the
 * executor (with RBAC + Jira permission checks) can decide what to do.
 *
 * Design rule (M6): ambiguous natural language never executes directly. Any
 * input that does not cleanly match a known command shape is classified as
 * `unknown`, which the executor answers with help and a no-op.
 *
 * The legacy free-form forms (DONE/CLOSE/MOVE ... TO) still parse so the web
 * inbox keeps working, but they are mapped onto the same command vocabulary.
 */

export const KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

export type ChatCommand =
  | { kind: "task"; keys: string[] }
  | { kind: "move"; keys: string[]; status: string }
  | { kind: "assign"; keys: string[]; who: string }
  | { kind: "watch"; keys: string[] }
  | { kind: "unwatch"; keys: string[] }
  | { kind: "release"; version: string; action: "check" }
  | { kind: "stale"; scope: string | null }
  | { kind: "link" }
  | { kind: "unlink" }
  | { kind: "help" }
  | { kind: "confirm" }
  | { kind: "unknown"; raw: string; hint?: string };

const WORD_VERBS: Record<string, ChatCommand["kind"]> = {
  task: "task",
  move: "move",
  assign: "assign",
  watch: "watch",
  unwatch: "unwatch",
  release: "release",
  stale: "stale",
  link: "link",
  unlink: "unlink",
  help: "help",
  confirm: "confirm",
  confirmed: "confirm",
  "yes": "confirm",
};

/** Extract all Jira-style keys from a string, de-duped in order. */
export function extractKeys(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(KEY_RE)) found.push(m[1]);
  return Array.from(new Set(found));
}

function firstToken(text: string): string | null {
  const t = text.match(/^(\S+)/);
  return t ? t[1] : null;
}

/**
 * Parse a single chat line into a normalized command. Never throws; unknown
 * input is returned as kind "unknown" with a helpful hint.
 */
export function parseChatCommand(raw: string): ChatCommand {
  const rawText = raw.trim();
  // Strip a single leading "/" so "/task" and "task" are treated the same.
  const text = rawText.startsWith("/") ? rawText.slice(1) : rawText;
  if (!text) return { kind: "unknown", raw: rawText, hint: "Empty message." };

  const first = firstToken(text);
  const lower = first ? first.toLowerCase() : "";
  const verb = WORD_VERBS[lower];

  // Slash form ("/task ...") and bare word form ("task ...") are equivalent.
  const rest = (text.length > first!.length ? text.slice(first!.length).trim() : "");

  // Slash commands: strip the leading token; word commands: rest already trimmed.
  if (verb) {
    switch (verb) {
      case "task": {
        const keys = extractKeys(rest);
        if (keys.length === 0) return { kind: "unknown", raw, hint: 'Usage: /task PROJ-123' };
        return { kind: "task", keys };
      }
      case "move": {
        // MOVE PROJ-123 "In Progress"  |  MOVE PROJ-123 PROJ-124 TO Done
        const keys = extractKeys(rest);
        if (keys.length === 0) return { kind: "unknown", raw, hint: 'Usage: /move PROJ-123 "In Progress"' };
        const toMatch = rest.match(/\bTO\b\s+(.+)$/i);
        const status = toMatch ? toMatch[1].trim().replace(/^["']|["']$/g, "") : rest.replace(KEY_RE, "").trim().replace(/^["']|["']$/g, "");
        if (!status) return { kind: "unknown", raw, hint: 'Usage: /move PROJ-123 "In Progress"' };
        return { kind: "move", keys, status };
      }
      case "assign": {
        const keys = extractKeys(rest);
        if (keys.length === 0) return { kind: "unknown", raw, hint: 'Usage: /assign PROJ-123 me' };
        const who = rest.replace(KEY_RE, "").trim().replace(/^["']|["']$/g, "");
        if (!who) return { kind: "unknown", raw, hint: 'Usage: /assign PROJ-123 me' };
        return { kind: "assign", keys, who };
      }
      case "watch": {
        const keys = extractKeys(rest);
        if (keys.length === 0) return { kind: "unknown", raw, hint: "Usage: /watch PROJ-123" };
        return { kind: "watch", keys };
      }
      case "unwatch": {
        const keys = extractKeys(rest);
        if (keys.length === 0) return { kind: "unknown", raw, hint: "Usage: /unwatch PROJ-123" };
        return { kind: "unwatch", keys };
      }
      case "release": {
        // release 1.4.2 check
        const m = rest.match(/^(\S+)\s+(check|status|ready)$/i);
        if (!m) return { kind: "unknown", raw, hint: 'Usage: /release 1.4.2 check' };
        return { kind: "release", version: m[1], action: "check" };
      }
      case "stale": {
        const scope = rest || null;
        return { kind: "stale", scope };
      }
      case "link":
        return { kind: "link" };
      case "unlink":
        return { kind: "unlink" };
      case "help":
        return { kind: "help" };
      case "confirm":
        return { kind: "confirm" };
    }
  }

  // Legacy free-form forms from the web inbox — kept for backward compat.
  //   MOVE PROJ-1 TO In Progress | DONE PROJ-2 | CLOSE PROJ-3 | REOPEN PROJ-4
  const legacyMove = text.match(/^(?:MOVE|SET)\s+(.*?)\s+TO\s+(.+)$/i);
  if (legacyMove) {
    const keys = extractKeys(legacyMove[1]);
    const status = legacyMove[2].trim().replace(/^["']|["']$/g, "");
    if (keys.length > 0 && status) return { kind: "move", keys, status };
  }
  const verbStatus: Record<string, string> = { done: "Done", close: "Closed", reopen: "To Do", todo: "To Do", resolve: "Resolved" };
  for (const v of Object.keys(verbStatus)) {
    if (lower === v && /\s/.test(text)) {
      const keys = extractKeys(text.slice(v.length));
      if (keys.length > 0) return { kind: "move", keys, status: verbStatus[v] };
    }
  }
  const arrow = text.match(/^([A-Z][A-Z0-9]+-\d+)\s*(?:->|:)\s*(.+)$/i);
  if (arrow) return { kind: "move", keys: [arrow[1]], status: arrow[2].trim() };

  return {
    kind: "unknown",
    raw,
    hint: 'Try /task PROJ-123, /move PROJ-123 "In Progress", /release 1.4.2 check, or /help',
  };
}
