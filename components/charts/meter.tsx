// Status colors are fixed/reserved (never themed) — see palette.md. Used here because
// pass rate literally means good/bad, which is exactly when the collision rule says a
// series wears status tokens instead of categorical color.
function severityColor(pct: number): string {
  if (pct >= 70) return "#0ca30c"; // good
  if (pct >= 40) return "#fab219"; // warning
  return "#d03b3b"; // critical
}

export function Meter({ label, percentage }: { label: string; percentage: number }) {
  const pct = Math.max(0, Math.min(100, percentage));
  const color = severityColor(pct);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums" style={{ color }}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
