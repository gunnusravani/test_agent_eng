import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { gradeColor, scoreToGrade } from "@/lib/grades";
import type { MultiProjectEvaluationResult, MultiProjectResult } from "@/types/schemas";

const PROJECT_LABELS: Array<{ key: "newsHighlights" | "conferenceWebsite" | "mockStubs" | "pomodoroTimer"; label: string }> = [
  { key: "newsHighlights", label: "News Highlights" },
  { key: "conferenceWebsite", label: "Conference Website" },
  { key: "mockStubs", label: "Mock Stubs" },
  { key: "pomodoroTimer", label: "Pomodoro Timer" },
];

export function MultiProjectResultCard({
  evaluation,
  weightedScore,
  classTitle,
}: {
  evaluation: MultiProjectEvaluationResult;
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
                Overall: <span className="font-medium text-foreground">{evaluation.data.overallScore}</span> / 100
                {evaluation.data.bonus.score > 0 ? ` (+${evaluation.data.bonus.score} bonus)` : ""}
              </span>
            </div>

            <p className="text-sm">{evaluation.data.summary}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              {PROJECT_LABELS.map(({ key, label }) => (
                <ProjectScore key={key} label={label} project={evaluation.data[key]} />
              ))}
            </div>

            <ProjectScore label="README" project={evaluation.data.readme} />

            {evaluation.data.bonus.features.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-sm font-medium">Bonus Features ({evaluation.data.bonus.score} pts)</div>
                <div className="flex flex-wrap gap-1.5">
                  {evaluation.data.bonus.features.map((feature) => (
                    <Badge key={feature} variant="secondary">
                      {feature}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="text-sm font-medium">Strengths & Improvements</div>
              <div className="space-y-3 text-sm">
                <FeedbackList title="Strengths" items={evaluation.data.strengths} />
                <FeedbackList title="Improvements" items={evaluation.data.improvements} />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectScore({ label, project }: { label: string; project: MultiProjectResult["readme"] }) {
  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {project.score} / {project.maxScore}
        </span>
      </div>
      <Progress value={(project.score / project.maxScore) * 100} />
      <p className="text-xs text-muted-foreground">{project.feedback}</p>
    </div>
  );
}

function StatusBadge({
  evaluation,
  weightedScore,
}: {
  evaluation: MultiProjectEvaluationResult;
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

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="font-medium">{title}</div>
      <ul className="list-disc pl-4 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
