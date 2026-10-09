const KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/i;

let epicLinkFieldIds: string[] = [];

/** Remember the Jira "Epic Link" custom field ids (discovered from /field) so they are fetched and read. */
export function setEpicLinkFieldIds(ids: string[]): void {
  epicLinkFieldIds = [...new Set(ids)];
}

export function getEpicLinkFieldIds(): string[] {
  return epicLinkFieldIds;
}

/** True for the Jira "Epic Link" field definition. */
export function isEpicLinkField(field: { name?: string; schema?: { custom?: string } | null }): boolean {
  return (
    field.schema?.custom === "com.pyxis.greenhopper.jira:gh-epic-link" ||
    field.name?.trim().toLowerCase() === "epic link"
  );
}

/**
 * Epic key of an issue's raw Jira fields. Only a real Epic counts: the Epic Link custom field,
 * an explicit `epic` object, or a `parent` whose issue type is Epic (sub-task parents are
 * Tasks/Stories and must not be reported as epics).
 */
export function extractEpicKey(
  raw: unknown,
  fieldIds: readonly string[] = epicLinkFieldIds
): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  for (const id of fieldIds) {
    const val = r[id];
    if (typeof val === "string" && KEY_PATTERN.test(val.trim())) return val.trim().toUpperCase();
  }
  if (r.epic && typeof r.epic === "object" && typeof (r.epic as { key?: unknown }).key === "string") {
    return (r.epic as { key: string }).key;
  }
  const parent = r.parent as { key?: unknown; fields?: { issuetype?: { name?: unknown } } } | null | undefined;
  if (parent && typeof parent === "object" && typeof parent.key === "string") {
    const typeName = parent.fields?.issuetype?.name;
    if (typeof typeName === "string" && typeName.trim().toLowerCase() === "epic") return parent.key;
  }
  return null;
}
