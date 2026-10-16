import { useCallback, useState } from "react";

export interface UseShowMoreReturn {
  visibleCount: number;
  rawVisibleCount: number;
  hasMore: boolean;
  showMore: () => void;
  reset: () => void;
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>;
}

export function useShowMore(total: number, step = 50, initial = 50): UseShowMoreReturn {
  const [visibleCount, setVisibleCount] = useState(initial);

  const hasMore = visibleCount < total;

  const showMore = useCallback(() => {
    setVisibleCount((prev) => prev + step);
  }, [step]);

  const reset = useCallback(() => {
    setVisibleCount(initial);
  }, [initial]);

  return {
    visibleCount: Math.min(visibleCount, total),
    rawVisibleCount: visibleCount,
    hasMore,
    showMore,
    reset,
    setVisibleCount,
  };
}
