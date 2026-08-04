"use client";

import { useState, type PointerEvent } from "react";

export interface LinePoint {
  label: string;
  value: number;
}

const WIDTH = 600;
const HEIGHT = 160;
const PAD_TOP = 12;
const PAD_BOTTOM = 4;

/**
 * Single-series line chart with an area wash and a crosshair that snaps to the
 * nearest point on pointer move — per dataviz interaction.md, the reader aims at
 * a position, never a 2px line. One tooltip row (this is a single series, so no
 * legend box is needed — the card title already names what's plotted).
 */
export function LineChart({
  data,
  color = "#2a78d6",
  valueFormat = (v: number) => String(v),
}: {
  data: LinePoint[];
  color?: string;
  valueFormat?: (value: number) => string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const points = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * WIDTH : 0;
    const y = PAD_TOP + plotHeight - (d.value / max) * plotHeight;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1]?.x ?? 0},${HEIGHT} L0,${HEIGHT} Z`;

  function handlePointerMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-40 w-full touch-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
        role="img"
        aria-label="Submissions per day over the last 30 days"
      >
        <line x1={0} y1={HEIGHT - PAD_BOTTOM} x2={WIDTH} y2={HEIGHT - PAD_BOTTOM} stroke="var(--border)" strokeWidth={1} />
        <path d={areaPath} fill={color} opacity={0.1} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hovered && (
          <>
            <line x1={hovered.x} y1={PAD_TOP} x2={hovered.x} y2={HEIGHT - PAD_BOTTOM} stroke="var(--border)" strokeWidth={1} />
            <circle cx={hovered.x} cy={hovered.y} r={4} fill={color} stroke="var(--card)" strokeWidth={2} />
          </>
        )}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background"
          style={{ left: `${(hovered.x / WIDTH) * 100}%` }}
        >
          <span className="font-semibold">{valueFormat(hovered.value)}</span>
          <span className="ml-1.5 opacity-70">{hovered.label}</span>
        </div>
      )}
    </div>
  );
}
