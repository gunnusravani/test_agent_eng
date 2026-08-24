import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { gradeColor, scoreToGrade } from "@/lib/grades";
import type { Class02aEvaluationResult } from "@/types/schemas";
import { CheckCircle2Icon, XCircleIcon } from "lucide-react";

export function Class02aResultCard({
  evaluation,
  weightedScore,
  classTitle,
}: {
  evaluation: Class02aEvaluationResult;
  weightedScore: number | null;
  classTitle: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{classTitle}</CardTitle>
          <p className="mt-0.5 font-mono text-sm text-muted-foreground">{evaluation.classId}</p>
        </div>
        <StatusBadge evaluation={evaluation} weightedScore={weightedScore} />
      </CardHeader>
      <CardContent className="space-y-5">
        {evaluation.status === "error" && <p className="text-sm text-destructive">{evaluation.message}</p>}

        {evaluation.status === "success" && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>
                Overall: <span className="font-medium text-foreground">{evaluation.data.overallScore}</span> / {evaluation.data.maxScore}
              </span>
            </div>

            <p className="text-sm">{evaluation.data.summary}</p>

            <div className="space-y-1.5">
              {evaluation.data.checks.map((c) => (
                <div key={c.name} className="flex items-start gap-2 rounded-lg border p-2.5 text-sm">
                  {c.passed ? (
                    <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <XCircleIcon className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{c.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {c.points} / {c.maxPoints}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{c.feedback}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  evaluation,
  weightedScore,
}: {
  evaluation: Class02aEvaluationResult;
  weightedScore: number | null;
}) {
  if (evaluation.status === "error") {
    return <Badge variant="destructive">Error</Badge>;
  }
  if (weightedScore == null) {
    return <Badge variant="outline">Unscored</Badge>;
  }
  const grade = scoreToGrade(weightedScore);
  return <span className={`text-2xl font-semibold ${gradeColor(grade)}`}>{grade}</span>;
}
