export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

/**
 * Part-to-whole donut. Per dataviz anti-patterns, a pie/donut is only valid for
 * "part-to-whole at a glance, <=6 segments" — not for comparing close values and
 * never a 2-slice ratio (that's a Meter). Callers must cap at 6 slots and fold
 * the rest into an "Other" bucket before this component ever sees the data.
 * Legend carries the real values in text tokens; the ring never carries text.
 */
export function DonutChart({ data, size = 160, thickness = 22 }: { data: DonutDatum[]; size?: number; thickness?: number }) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let offsetAcc = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={thickness} />
        {data.map((d) => {
          const fraction = d.value / total;
          const dash = fraction * circumference;
          const strokeDashoffset = -offsetAcc;
          offsetAcc += dash;
          // 2px surface gap between segments (see dataviz marks-and-anatomy.md), not a border.
          const gapAdjustedDash = Math.max(dash - 2, 0);
          return (
            <circle
              key={d.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${gapAdjustedDash} ${circumference - gapAdjustedDash}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            >
              <title>{`${d.label}: ${d.value} (${Math.round(fraction * 100)}%)`}</title>
            </circle>
          );
        })}
      </svg>
      <ul className="space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} aria-hidden="true" />
            <span className="text-foreground">{d.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {d.value} ({Math.round((d.value / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
