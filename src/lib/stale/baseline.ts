/**
 * Baseline: expected cycle time (business days) per story point,
 * matching the JIRA work criteria table (mục 5).
 *
 * These are the *starting* baseline. After 2–3 sprints of real data
 * the team should replace them with measured averages.
 */

export interface PointBaseline {
  /** Story point value. */
  point: number;
  /** Expected cycle time lower bound (business days). */
  expectedMin: number;
  /** Expected cycle time upper bound (business days). */
  expectedMax: number;
  /** Alert threshold — bot flags when cycle time exceeds this. */
  alertAbove: number;
}

export const POINT_BASELINE: PointBaseline[] = [
  { point: 1,  expectedMin: 0.5, expectedMax: 1,   alertAbove: 1.5 },
  { point: 2,  expectedMin: 1,   expectedMax: 1.5, alertAbove: 2.5 },
  { point: 3,  expectedMin: 1.5, expectedMax: 2.5, alertAbove: 4 },
  { point: 5,  expectedMin: 2.5, expectedMax: 4,   alertAbove: 6 },
  { point: 8,  expectedMin: 4,   expectedMax: 6,   alertAbove: 9 },
  { point: 13, expectedMin: 6,   expectedMax: 9,   alertAbove: 13 },
];

export type PointAlertLevel = "within" | "warning" | "high";

/**
 * Compare actual cycle time (business days) against the baseline for a
 * given story point. Returns the alert level and the matched baseline.
 *
 * - "within":  cycle time ≤ expectedMax
 * - "warning": expectedMax < cycle time ≤ alertAbove
 * - "high":    cycle time > alertAbove
 *
 * When the point is not in the baseline table (e.g. 0, null, or > 13),
 * returns "warning" with no baseline reference.
 */
export function compareWithBaseline(
  points: number | null,
  actualCycleDays: number,
): { level: PointAlertLevel; baseline: PointBaseline | null } {
  if (points == null || points <= 0) {
    return { level: "warning", baseline: null };
  }
  const b = POINT_BASELINE.find((x) => x.point === points);
  if (!b) return { level: "warning", baseline: null };
  if (actualCycleDays <= b.expectedMax) return { level: "within", baseline: b };
  if (actualCycleDays <= b.alertAbove) return { level: "warning", baseline: b };
  return { level: "high", baseline: b };
}
