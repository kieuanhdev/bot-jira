/**
 * One-shot handoff of generated rows (e.g. AI sub-task split) to the bulk create
 * screen via sessionStorage (`bulk-create-handoff:<id>` + `?handoff=<id>`).
 * Kept apart from `bulk-create-draft:*` so it never overwrites the user's draft.
 */
import { MAX_BULK_CREATE_ITEMS, type BulkCreateRowInput } from "./create-types";

export const HANDOFF_KEY_PREFIX = "bulk-create-handoff:";
export const HANDOFF_TTL_MS = 30 * 60 * 1000;
const ID_LENGTH = 8;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_PATTERN = /^[a-z0-9]{8}$/;

export type HandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type BulkCreateHandoff = { projectKey: string; items: BulkCreateRowInput[] };

type StoredHandoff = BulkCreateHandoff & { savedAt: number };

function defaultStorage(): HandoffStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    // Access itself throws when storage is blocked.
    return null;
  }
}

function randomId(): string {
  // getRandomValues works on plain http too (randomUUID needs a secure context).
  const bytes = new Uint8Array(ID_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}

function isRow(value: unknown): value is BulkCreateRowInput {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.clientRef === "string" && typeof row.summary === "string";
}

/**
 * Store rows for the bulk screen and return the handoff id. Throws a
 * user-readable error when sessionStorage is unavailable or full.
 */
export function writeHandoff(
  projectKey: string,
  items: BulkCreateRowInput[],
  storage: HandoffStorage | null = defaultStorage(),
  now: number = Date.now()
): string {
  const id = randomId();
  const payload: StoredHandoff = { projectKey, items, savedAt: now };
  try {
    if (!storage) throw new Error("sessionStorage unavailable");
    storage.setItem(`${HANDOFF_KEY_PREFIX}${id}`, JSON.stringify(payload));
  } catch {
    throw new Error("Không lưu được danh sách sub-task trên trình duyệt, hãy thử lại.");
  }
  return id;
}

/**
 * Read and delete a handoff. Returns null when missing, malformed, older than
 * 30 minutes, or when storage is unavailable.
 */
export function readHandoff(
  id: string,
  storage: HandoffStorage | null = defaultStorage(),
  now: number = Date.now()
): BulkCreateHandoff | null {
  if (!storage || !ID_PATTERN.test(id)) return null;
  const key = `${HANDOFF_KEY_PREFIX}${id}`;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
    storage.removeItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const data = parsed as Partial<StoredHandoff>;
  if (typeof data.projectKey !== "string" || !data.projectKey.trim()) return null;
  if (typeof data.savedAt !== "number" || now - data.savedAt > HANDOFF_TTL_MS || data.savedAt > now + 60_000) {
    return null;
  }
  if (
    !Array.isArray(data.items) ||
    data.items.length === 0 ||
    data.items.length > MAX_BULK_CREATE_ITEMS ||
    !data.items.every(isRow)
  ) {
    return null;
  }
  return { projectKey: data.projectKey, items: data.items };
}
