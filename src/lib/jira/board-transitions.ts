export type BoardTransition = {
  id: string;
  name?: string;
  to?: { name?: string } | string;
};

export function normalizeStatus(value: string): string {
  return value.trim().toLowerCase();
}

export function transitionTarget(transition: BoardTransition): string {
  return typeof transition.to === "string" ? transition.to : transition.to?.name ?? "";
}

export function canTransitionToStatus(
  transitions: BoardTransition[],
  targetStatus: string
): boolean {
  const target = normalizeStatus(targetStatus);
  return transitions.some((transition) => normalizeStatus(transitionTarget(transition)) === target);
}

/**
 * Resolve an exact target status. Jira can return both a global transition and
 * a directed workflow transition for the same destination. Prefer the directed
 * action (its action name differs from the destination name), while retaining
 * the global transition as a valid fallback.
 */
export function findTransitionToStatus<T extends BoardTransition>(
  transitions: T[],
  targetStatus: string
): T | null {
  const target = normalizeStatus(targetStatus);
  const matches = transitions.filter(
    (transition) => normalizeStatus(transitionTarget(transition)) === target
  );

  return (
    matches.find((transition) => normalizeStatus(transition.name ?? "") !== target) ??
    matches[0] ??
    null
  );
}
