"use client";

import * as React from "react";
import { cn, formatNumber } from "@/lib/utils";

export type SparklineDataPoint = number | { value: number; label?: string };

export type SparklineProps = {
  data: SparklineDataPoint[];
  minPoints?: number;
  width?: number;
  height?: number;
  tone?: "teal" | "emerald" | "amber" | "rose" | "neutral";
  unit?: string;
  formatter?: (val: number) => string;
  emptyFallback?: React.ReactNode;
  ariaLabel?: string;
  className?: string;
};

const TONE_COLORS = {
  teal: {
    stroke: "var(--primary, #0d9488)",
    fill: "var(--primary, #0d9488)",
    dot: "var(--primary, #0d9488)",
  },
  emerald: {
    stroke: "#10b981",
    fill: "#10b981",
    dot: "#059669",
  },
  amber: {
    stroke: "#f59e0b",
    fill: "#f59e0b",
    dot: "#d97706",
  },
  rose: {
    stroke: "#f43f5e",
    fill: "#f43f5e",
    dot: "#e11d48",
  },
  neutral: {
    stroke: "currentColor",
    fill: "currentColor",
    dot: "currentColor",
  },
};

export function Sparkline({
  data,
  minPoints = 4,
  width = 80,
  height = 22,
  tone = "teal",
  unit = "",
  formatter,
  emptyFallback = <span className="text-muted-foreground text-xs">—</span>,
  ariaLabel,
  className,
}: SparklineProps) {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const rawId = React.useId();
  const gradId = rawId.replace(/:/g, "");

  const values = React.useMemo(() => {
    return data.map((d) => (typeof d === "number" ? d : d.value));
  }, [data]);

  // Rule: dưới 4 điểm dữ liệu thì không vẽ chart
  if (!values || values.length < minPoints) {
    return <>{emptyFallback}</>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min === 0 ? 1 : max - min;
  const paddingY = 3;
  const availableHeight = height - paddingY * 2;
  const stepX = (width - 6) / (values.length - 1);

  const points = values.map((val, idx) => {
    const x = 3 + idx * stepX;
    const y = height - paddingY - ((val - min) / range) * availableHeight;
    return { x, y, val };
  });

  const pathD = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, "");

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  const lastPoint = points[points.length - 1];
  const activePoint = hoverIndex !== null ? points[hoverIndex] : lastPoint;

  const formatValue = (v: number) => {
    if (formatter) return formatter(v);
    if (unit === "ms") return `${Math.round(v)} ms`;
    if (unit === "s") return `${v.toFixed(1)} s`;
    return `${formatNumber(v)}${unit ? ` ${unit}` : ""}`;
  };

  const defaultAria = `Biểu đồ xu hướng: giá trị hiện tại ${formatValue(lastPoint.val)}, thấp nhất ${formatValue(min)}, cao nhất ${formatValue(max)}`;
  const colors = TONE_COLORS[tone] || TONE_COLORS.teal;

  return (
    <div
      className={cn("group/sparkline relative inline-flex items-center", className)}
      title={`Gần nhất: ${formatValue(lastPoint.val)} (Min: ${formatValue(min)} · Max: ${formatValue(max)})`}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible cursor-pointer"
        role="img"
        aria-label={ariaLabel || defaultAria}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={`grad-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.fill} stopOpacity="0.25" />
            <stop offset="100%" stopColor={colors.fill} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Shaded Area */}
        <path d={areaD} fill={`url(#grad-${gradId})`} />

        {/* Main Line */}
        <path
          d={pathD}
          fill="none"
          stroke={colors.stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Interactive Dots & Hover Triggers */}
        {points.map((pt, idx) => (
          <g key={idx} onMouseEnter={() => setHoverIndex(idx)}>
            <circle
              cx={pt.x}
              cy={pt.y}
              r={hoverIndex === idx ? 3.5 : idx === points.length - 1 ? 2.5 : 1.5}
              fill={hoverIndex === idx || idx === points.length - 1 ? colors.dot : "transparent"}
              className="transition-all duration-150 motion-reduce:transition-none"
            />
            {/* Wider transparent hit zone */}
            <rect
              x={pt.x - stepX / 2}
              y={0}
              width={stepX}
              height={height}
              fill="transparent"
            />
          </g>
        ))}
      </svg>

      {/* Floating Mini Tooltip when hovering over a point */}
      {hoverIndex !== null && (
        <div
          className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-30 rounded border border-border bg-popover px-1.5 py-0.5 text-[10px] font-medium text-popover-foreground shadow-sm whitespace-nowrap"
          role="tooltip"
        >
          {formatValue(activePoint.val)}
        </div>
      )}
    </div>
  );
}
