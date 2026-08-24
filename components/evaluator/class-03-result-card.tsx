import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { gradeColor, scoreToGrade } from "@/lib/grades";
import type { Class03EvaluationResult, Class03Result } from "@/types/schemas";

const COMPONENT_LABELS: Array<{
  key: "configFiles" | "instructions" | "contextBuilder" | "evidenceAndSafety" | "scenariosAndTests" | "scopeDiscipline";
  label: string;
}> = [
  { key: "configFiles", label: "Config Files" },
  { key: "instructions", label: "Agent Instructions" },
  { key: "contextBuilder", label: "Context Builder" },
  { key: "evidenceAndSafety", label: "Evidence & Safety" },
  { key: "scenariosAndTests", label: "Scenarios & Tests" },
  { key: "scopeDiscipline", label: "Scope Discipline" },
];

export function Class03ResultCard({
  evaluation,
  weightedScore,
  classTitle,
}: {
  evaluation: Class03EvaluationResult;
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
                Overall: <span className="font-medium text-foreground">{evaluation.data.overallScore - evaluation.data.bonus.score}</span> / 100
                {evaluation.data.bonus.score > 0 ? ` (+${evaluation.data.bonus.score} bonus = ${evaluation.data.overallScore} total)` : ""}
              </span>
            </div>

            <p className="text-sm">{evaluation.data.summary}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              {COMPONENT_LABELS.map(({ key, label }) => (
                <ComponentScore key={key} label={label} component={evaluation.data[key]} />
              ))}
            </div>

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

function ComponentScore({ label, component }: { label: string; component: Class03Result["configFiles"] }) {
  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {component.score} / {component.maxScore}
        </span>
      </div>
      <Progress value={(component.score / component.maxScore) * 100} />
      <p className="text-xs text-muted-foreground">{component.feedback}</p>
    </div>
  );
}

function StatusBadge({
  evaluation,
  weightedScore,
}: {
  evaluation: Class03EvaluationResult;
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
