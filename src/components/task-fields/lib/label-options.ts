import { MAX_LABELS_COUNT, MAX_LABEL_LENGTH } from "@/lib/bulk/create-types";

export type LabelOption = { value: string; isNew: boolean };

function hasLabel(list: string[], label: string): boolean {
  const lower = label.toLowerCase();
  return list.some((item) => item.toLowerCase() === lower);
}

export function buildLabelOptions(
  input: string,
  suggestions: string[],
  selected: string[]
): LabelOption[] {
  const typed = input.trim();
  const options: LabelOption[] = suggestions
    .filter((s) => !hasLabel(selected, s))
    .map((value) => ({ value, isNew: false }));

  const canCreate =
    typed.length > 0 &&
    typed.length <= MAX_LABEL_LENGTH &&
    selected.length < MAX_LABELS_COUNT &&
    !hasLabel(selected, typed) &&
    !options.some((o) => o.value.toLowerCase() === typed.toLowerCase());

  return canCreate ? [{ value: typed, isNew: true }, ...options] : options;
}

export function addLabel(selected: string[], raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_LABEL_LENGTH) return selected;
  if (selected.length >= MAX_LABELS_COUNT) return selected;
  if (hasLabel(selected, trimmed)) return selected;
  return [...selected, trimmed];
}
