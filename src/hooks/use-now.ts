"use client";

import * as React from "react";

const TICK_MS = 15_000;

// Module-level cache: `getSnapshot` must return a stable value. Returning
// `Date.now()` directly yields a new value on every call, which React treats as
// a store change and re-renders until it throws "Maximum update depth exceeded".
let now = 0;

function subscribe(onChange: () => void) {
  now = Date.now();
  onChange();
  const id = setInterval(() => {
    now = Date.now();
    onChange();
  }, TICK_MS);
  return () => clearInterval(id);
}

const getSnapshot = () => now;
const getServerSnapshot = () => 0;

/**
 * Current timestamp that ticks every 15s. Returns 0 during SSR and hydration so
 * server and client markup match.
 */
export function useNow(): number {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
