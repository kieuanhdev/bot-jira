/** Epic key of an issue's raw Jira fields (parent, epic link object, or a custom field holding a key). */
export function extractEpicKey(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.parent && typeof r.parent === "object" && typeof (r.parent as { key?: unknown }).key === "string") {
    return (r.parent as { key: string }).key;
  }
  if (r.epic && typeof r.epic === "object" && typeof (r.epic as { key?: unknown }).key === "string") {
    return (r.epic as { key: string }).key;
  }
  for (const [key, val] of Object.entries(r)) {
    if (key.startsWith("customfield_") && typeof val === "string" && /^[A-Z][A-Z0-9_]+-\d+$/i.test(val)) {
      return val.toUpperCase();
    }
  }
  return null;
}
