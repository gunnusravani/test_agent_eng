import { cn } from "@/lib/utils";

/** ML Academy wordmark: a bordered M/L monogram beside stacked "MACHINE LEARNING ACADEMY" text. */
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  const markSize = compact ? 28 : 40;
  const fontSize = compact ? 12 : 15;

  return (
    <div className={cn("flex items-center", compact ? "gap-2" : "gap-3", className)}>
      <svg width={markSize} height={markSize} viewBox="0 0 40 40" className="shrink-0" aria-hidden="true">
        <rect x="1" y="1" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="1" y1="20" x2="39" y2="20" stroke="currentColor" strokeWidth="2" />
        <text x="20" y="11" textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight="700" fill="currentColor">
          M
        </text>
        <text x="20" y="30" textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight="700" fill="currentColor">
          L
        </text>
      </svg>
      {compact ? (
        <span className="font-bold tracking-wide uppercase" style={{ fontSize }}>
          ML Academy
        </span>
      ) : (
        <div className="font-bold leading-[1.15] uppercase" style={{ fontSize }}>
          <div>Machine</div>
          <div>Learning</div>
          <div>Academy</div>
        </div>
      )}
    </div>
  );
}
