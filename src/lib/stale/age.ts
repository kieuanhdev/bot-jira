import { isBlockedStatus } from "./sla";
import { businessDaysBetween } from "./business-days";

export interface TaskAges {
  /** Business days since task creation. */
  totalAgeDays: number;
  /** Business days in the current status. Falls back to updatedAt when statusChangedAt is missing. */
  stateAgeDays: number;
  /** Business days since last meaningful update (updatedAt). */
  inactiveDays: number;
  /** Business days the task has been in a blocked state; 0 when not blocked. */
  blockedDays: number;
  /** True when stateAgeDays is derived from updatedAt (low confidence). */
  stateAgeLowConfidence: boolean;
}

interface AgeInput {
  createdAt: Date | null;
  statusChangedAt: Date | null;
  updatedAt: Date | null;
  status: string;
}

/**
 * Compute the four age metrics for a task in **business days** (Mon–Fri).
 *
 * - `totalAgeDays`: business days from `createdAt` to now.
 * - `stateAgeDays`: business days from `statusChangedAt` to now; falls back to `updatedAt`.
 * - `inactiveDays`: business days from `updatedAt` to now.
 * - `blockedDays`: business days from `statusChangedAt` to now when the current
 *   status is a blocked state; 0 otherwise.
 */
export function computeAges(input: AgeInput, now: Date = new Date()): TaskAges {
  const totalAgeDays = businessDaysBetween(input.createdAt, now);

  const hasStatusChanged = input.statusChangedAt !== null;
  const stateRef = hasStatusChanged ? input.statusChangedAt! : (input.updatedAt ?? now);
  const stateAgeDays = businessDaysBetween(stateRef, now);

  const inactiveDays = businessDaysBetween(input.updatedAt, now);

  const blocked = isBlockedStatus(input.status);
  const blockedDays = blocked && hasStatusChanged ? businessDaysBetween(input.statusChangedAt!, now) : 0;

  return {
    totalAgeDays,
    stateAgeDays,
    inactiveDays,
    blockedDays,
    stateAgeLowConfidence: !hasStatusChanged,
  };
}
