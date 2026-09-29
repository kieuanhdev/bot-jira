export type ReleaseSummaryItem = {
  id: string;
  archived: boolean;
  jiraReleased: boolean;
  taskCount: number;
  deliveryReadyCount: number;
};

export type ReleaseSummary = {
  totalActive: number;
  inProgress: number;
  ready: number;
  empty: number;
  released: number;
  archived: number;
};

/**
 * Compute the 5 mutually exclusive KPI groups plus archived count.
 * Invariant: totalActive = inProgress + ready + empty + released
 */
export function computeReleaseSummary(items: ReleaseSummaryItem[]): ReleaseSummary {
  let inProgress = 0;
  let ready = 0;
  let empty = 0;
  let released = 0;
  let archived = 0;

  for (const item of items) {
    if (item.archived) {
      archived++;
      continue;
    }

    if (item.jiraReleased) {
      released++;
    } else if (item.taskCount === 0) {
      empty++;
    } else if (item.deliveryReadyCount === item.taskCount) {
      ready++;
    } else {
      inProgress++;
    }
  }

  const totalActive = inProgress + ready + empty + released;

  return {
    totalActive,
    inProgress,
    ready,
    empty,
    released,
    archived,
  };
}
