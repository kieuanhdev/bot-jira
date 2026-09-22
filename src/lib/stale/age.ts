import { isBlockedStatus } from "./sla";

export interface TaskAges {
  /** Days since task creation. */
  totalAgeDays: number;
  /** Days in the current status. Falls back to updatedAt when statusChangedAt is missing. */
  stateAgeDays: number;
  /** Days since last meaningful update (updatedAt). */
  inactiveDays: number;
  /** Days the task has been in a blocked state; 0 when not blocked. */
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY));
}

/**
 * Compute the four age metrics for a task (M8-01).
 *
 * - `totalAgeDays`: from `createdAt` to now.
 * - `stateAgeDays`: from `statusChangedAt` to now; falls back to `updatedAt`.
 * - `inactiveDays`: from `updatedAt` to now.
 * - `blockedDays`: from `statusChangedAt` to now when the current status is
 *   a blocked state; 0 otherwise.
 */
export function computeAges(input: AgeInput, now: Date = new Date()): TaskAges {
  const totalAgeDays = input.createdAt ? daysBetween(input.createdAt, now) : 0;

  const hasStatusChanged = input.statusChangedAt !== null;
  const stateRef = hasStatusChanged ? input.statusChangedAt! : (input.updatedAt ?? now);
  const stateAgeDays = daysBetween(stateRef, now);

  const inactiveDays = input.updatedAt ? daysBetween(input.updatedAt, now) : 0;

  const blocked = isBlockedStatus(input.status);
  const blockedDays = blocked && hasStatusChanged ? daysBetween(input.statusChangedAt!, now) : 0;

  return {
    totalAgeDays,
    stateAgeDays,
    inactiveDays,
    blockedDays,
    stateAgeLowConfidence: !hasStatusChanged,
  };
}
