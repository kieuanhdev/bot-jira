export const SPIKE_DELTA_MIN = 50;
export const SPIKE_PERCENT_MIN = 0.5; // 50% increase over baseline

export type SpikeInput = {
  eventCount?: number | null;
  countBaseline?: number | null;
  countBaselineAt?: Date | string | null;
};

export type SpikeResult = {
  delta: number;
  hot: boolean;
};

/**
 * Pure function to detect sudden spikes in Sentry issue event volume over a ~24h sliding window.
 *
 * Rules:
 * - A brand-new issue (baseline is 0 or null) is "hot" when its eventCount >= SPIKE_DELTA_MIN (50).
 * - An existing issue with baseline > 0 is "hot" when:
 *     delta >= SPIKE_DELTA_MIN (50) AND delta >= baseline * SPIKE_PERCENT_MIN (50%).
 */
export function spikeOf(input: SpikeInput): SpikeResult {
  const currentCount = Math.max(0, input.eventCount ?? 0);
  const baseline = input.countBaseline;

  // New issue or baseline has not been established (0 or null/undefined)
  if (baseline === null || baseline === undefined || baseline <= 0) {
    return {
      delta: currentCount,
      hot: currentCount >= SPIKE_DELTA_MIN,
    };
  }

  // Baseline exists and is > 0
  const delta = Math.max(0, currentCount - baseline);
  const hot = delta >= SPIKE_DELTA_MIN && delta >= baseline * SPIKE_PERCENT_MIN;

  return { delta, hot };
}
