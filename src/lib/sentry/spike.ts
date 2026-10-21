export const SPIKE_DELTA_MIN = 50;
export const SPIKE_PERCENT_MIN = 0.5; // 50% increase over baseline

const NEW_ISSUE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type SpikeInput = {
  eventCount?: number | null;
  countBaseline?: number | null;
  countBaselineAt?: Date | string | null;
  firstSeen?: Date | string | null;
};

export type SpikeResult = {
  delta: number;
  hot: boolean;
};

/**
 * Pure function to detect sudden spikes in Sentry issue event volume over a ~24h sliding window.
 *
 * Rules:
 * - An issue with no baseline (0 or null) is only "hot" when it is genuinely new (firstSeen within the
 *   last 24h) and its eventCount >= SPIKE_DELTA_MIN (50). Older issues without a baseline yet are not hot:
 *   there is nothing to compare against until the first 24h window has been recorded.
 * - An existing issue with baseline > 0 is "hot" when:
 *     delta >= SPIKE_DELTA_MIN (50) AND delta >= baseline * SPIKE_PERCENT_MIN (50%).
 */
export function spikeOf(input: SpikeInput, now: Date = new Date()): SpikeResult {
  const currentCount = Math.max(0, input.eventCount ?? 0);
  const baseline = input.countBaseline;

  // Baseline has not been established (0 or null/undefined)
  if (baseline === null || baseline === undefined || baseline <= 0) {
    const firstSeen = input.firstSeen ? new Date(input.firstSeen).getTime() : NaN;
    const isNew = Number.isFinite(firstSeen) && now.getTime() - firstSeen <= NEW_ISSUE_WINDOW_MS;
    if (!isNew) return { delta: 0, hot: false };
    return { delta: currentCount, hot: currentCount >= SPIKE_DELTA_MIN };
  }

  // Baseline exists and is > 0
  const delta = Math.max(0, currentCount - baseline);
  const hot = delta >= SPIKE_DELTA_MIN && delta >= baseline * SPIKE_PERCENT_MIN;

  return { delta, hot };
}
