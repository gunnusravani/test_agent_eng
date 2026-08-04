export interface BarDatum {
  label: string;
  value: number;
}

/**
 * Vertical bar/column chart. Single sequential hue (magnitude, not identity — see
 * dataviz color-formula.md), 4px rounded caps, hairline baseline, hover/focus
 * tooltip on each bar (no persistent per-bar labels — with up to 11 categories,
 * a label on every bar would be the "flood the chart" anti-pattern). Every value
 * is still reachable without hovering via the bar's aria-label.
 */
export function BarChart({
  data,
  color = "#2a78d6",
  valueFormat = (v: number) => String(v),
  height = 160,
}: {
  data: BarDatum[];
  color?: string;
  valueFormat?: (value: number) => string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div>
      <div className="flex items-end gap-1.5 border-b border-border" style={{ height }}>
        {data.map((d) => {
          const pct = (d.value / max) * 100;
          return (
            <div key={d.label} className="group relative flex h-full flex-1 flex-col items-center justify-end">
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs font-medium whitespace-nowrap text-background group-hover:block group-focus-within:block">
                {valueFormat(d.value)}
              </div>
              <div
                tabIndex={0}
                aria-label={`${d.label}: ${valueFormat(d.value)}`}
                className="w-full max-w-9 rounded-t-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                style={
                  d.value > 0
                    ? { height: `${Math.max(pct, 1.5)}%`, backgroundColor: color }
                    : { height: 2, backgroundColor: "var(--border)" }
                }
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex-1 truncate text-center text-[11px] text-muted-foreground" title={d.label}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
