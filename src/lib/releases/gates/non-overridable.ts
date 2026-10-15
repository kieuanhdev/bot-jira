/**
 * Leaf module defining release gates that CANNOT be overridden under any circumstances (REL-03).
 *
 * Release safety invariant (architecture.md):
 * - `non_empty_release`: must always be evaluated from data (cannot ship empty release).
 * - `ci`: mandatory source-of-truth gate (an override would allow shipping a broken build).
 *
 * DO NOT make this set smaller.
 */
export const GATE_NON_EMPTY = "non_empty_release";
export const GATE_CI = "ci";

export const NON_OVERRIDABLE_GATES = new Set<string>([GATE_NON_EMPTY, GATE_CI]);
export const NON_OVERRIDABLE = NON_OVERRIDABLE_GATES;
