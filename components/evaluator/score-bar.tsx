import { Progress } from "@/components/ui/progress";
import { scoreToPercent } from "@/lib/grades";

export function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-sm text-muted-foreground">{label}</span>
      <Progress value={scoreToPercent(score)} className="flex-1" />
      <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums">{score.toFixed(1)}</span>
    </div>
  );
}
