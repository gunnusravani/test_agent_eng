import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreBar } from "@/components/evaluator/score-bar";
import { gradeColor } from "@/lib/grades";
import type { RepositoryReport } from "@/types/schemas";

export function OverallScoreCard({ aggregate }: { aggregate: RepositoryReport["aggregate"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Repository Score</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
          <div>
            <div className="text-sm text-muted-foreground">Overall Grade</div>
            <div className={`text-4xl font-semibold ${gradeColor(aggregate.overallGrade)}`}>{aggregate.overallGrade}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Completion</div>
            <div className="text-2xl font-semibold">
              {aggregate.completedCount} / {aggregate.totalCount}
              <span className="ml-1.5 text-base font-normal text-muted-foreground">
                ({Math.round(aggregate.completionPercentage)}%)
              </span>
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Avg. Confidence</div>
            <div className="text-2xl font-semibold">{Math.round(aggregate.averageConfidence * 100)}%</div>
          </div>
        </div>

        <div className="space-y-2">
          <ScoreBar label="Completeness" score={aggregate.averageScores.completeness} />
          <ScoreBar label="Correctness" score={aggregate.averageScores.correctness} />
          <ScoreBar label="Quality" score={aggregate.averageScores.quality} />
          <ScoreBar label="Novelty" score={aggregate.averageScores.novelty} />
          <ScoreBar label="Understanding" score={aggregate.averageScores.understanding} />
        </div>
      </CardContent>
    </Card>
  );
}
