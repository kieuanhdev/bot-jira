"use client";

import { useEffect, useState } from "react";

/**
 * Standard debounce hook that returns a debounced copy of any value after delayMs.
 * Cancels pending timer when value or delayMs changes, or when component unmounts.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
