"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const DEFAULT_WINDOW_THRESHOLD = 100;
export const DEFAULT_OVERSCAN = 12;
export const DEFAULT_ROW_HEIGHT = 41;

export interface ComputeWindowedRangeOptions {
  totalRows: number;
  scrollTop: number;
  clientHeight: number;
  rowHeight: number;
  overscan?: number;
  threshold?: number;
}

export interface WindowedRangeResult {
  windowed: boolean;
  startIdx: number;
  endIdx: number;
  padTop: number;
  padBottom: number;
}

export function computeWindowedRange({
  totalRows,
  scrollTop,
  clientHeight,
  rowHeight,
  overscan = DEFAULT_OVERSCAN,
  threshold = DEFAULT_WINDOW_THRESHOLD,
}: ComputeWindowedRangeOptions): WindowedRangeResult {
  const windowed = totalRows > threshold;
  if (!windowed || rowHeight <= 0) {
    return {
      windowed: false,
      startIdx: 0,
      endIdx: totalRows,
      padTop: 0,
      padBottom: 0,
    };
  }

  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIdx = Math.min(
    totalRows,
    Math.ceil((scrollTop + clientHeight) / rowHeight) + overscan
  );
  const padTop = startIdx * rowHeight;
  const padBottom = Math.max(0, (totalRows - endIdx) * rowHeight);

  return {
    windowed,
    startIdx,
    endIdx,
    padTop,
    padBottom,
  };
}

export interface UseWindowedRowsOptions {
  totalRows: number;
  rowHeight?: number;
  overscan?: number;
  threshold?: number;
  rowSelector?: string;
}

export function useWindowedRows({
  totalRows,
  rowHeight: initialRowHeight = DEFAULT_ROW_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  threshold = DEFAULT_WINDOW_THRESHOLD,
  rowSelector = "tr[data-row]",
}: UseWindowedRowsOptions) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
  const [win, setWin] = useState({ top: 0, height: 800 });
  const [rowHeight, setRowHeight] = useState(initialRowHeight);

  const windowed = totalRows > threshold;

  const measure = useCallback(() => {
    const el = scrollRef.current;
    const body = tbodyRef.current;
    if (!el) return;
    const offsetTop = body ? body.offsetTop : 0;
    const top = Math.max(0, el.scrollTop - offsetTop);
    setWin((prev) =>
      Math.abs(prev.top - top) < rowHeight / 2 && prev.height === el.clientHeight
        ? prev
        : { top, height: el.clientHeight }
    );
  }, [rowHeight]);

  useEffect(() => {
    if (!windowed) return;
    const el = scrollRef.current;
    if (!el) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [windowed, measure]);

  useEffect(() => {
    if (!windowed) return;
    const container = tbodyRef.current ?? scrollRef.current;
    const row = container?.querySelector<HTMLElement>(rowSelector);
    const h = row?.offsetHeight;
    if (h && Math.abs(h - rowHeight) > 1) {
      setRowHeight(h);
    }
  }, [windowed, rowHeight, totalRows, rowSelector]);

  const range = computeWindowedRange({
    totalRows,
    scrollTop: win.top,
    clientHeight: win.height,
    rowHeight,
    overscan,
    threshold,
  });

  return {
    scrollRef,
    tbodyRef,
    rowHeight,
    ...range,
  };
}
