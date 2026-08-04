import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScoreBar } from "@/components/evaluator/score-bar";
import { FilePreviewDialog } from "@/components/evaluator/file-preview-dialog";
import { gradeColor } from "@/lib/grades";
import { getAssignment } from "@/config/assignments";
import type { AssignmentEvaluationResult, ClassFilesDto } from "@/types/schemas";

export function AssignmentCard({
  evaluation,
  files,
}: {
  evaluation: AssignmentEvaluationResult;
  files?: ClassFilesDto;
}) {
  const assignment = getAssignment(evaluation.classId);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{evaluation.classId}</CardTitle>
          {assignment && <p className="mt-0.5 text-sm text-muted-foreground">{assignment.title}</p>}
        </div>
        <StatusBadge evaluation={evaluation} />
      </CardHeader>
      <CardContent className="space-y-4">
        {evaluation.status === "not_submitted" && (
          <p className="text-sm text-muted-foreground">No submission found for this class.</p>
        )}

        {evaluation.status === "error" && <p className="text-sm text-destructive">{evaluation.message}</p>}

        {evaluation.status === "success" && (
          <>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>Confidence: {Math.round(evaluation.data.confidence * 100)}%</span>
            </div>

            <div className="space-y-2">
              <ScoreBar label="Completeness" score={evaluation.data.scores.completeness} />
              <ScoreBar label="Correctness" score={evaluation.data.scores.correctness} />
              <ScoreBar label="Quality" score={evaluation.data.scores.quality} />
              <ScoreBar label="Novelty" score={evaluation.data.scores.novelty} />
              <ScoreBar label="Understanding" score={evaluation.data.scores.understanding} />
            </div>

            <Accordion defaultValue={[]}>
              <AccordionItem value="feedback">
                <AccordionTrigger>LLM Feedback</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm">
                    <p>{evaluation.data.feedback.summary}</p>
                    <FeedbackList title="Strengths" items={evaluation.data.feedback.strengths} />
                    <FeedbackList title="Weaknesses" items={evaluation.data.feedback.weaknesses} />
                    <FeedbackList title="Missing Features" items={evaluation.data.feedback.missingFeatures} />
                    <FeedbackList title="Recommendations" items={evaluation.data.feedback.recommendations} />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}

        {files && (files.filesIncluded.length > 0 || files.filesOmitted.length > 0) && (
          <Accordion defaultValue={[]}>
            <AccordionItem value="files">
              <AccordionTrigger>
                Files Reviewed ({files.filesIncluded.length}
                {files.filesOmitted.length > 0 ? `, ${files.filesOmitted.length} omitted` : ""})
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-wrap gap-2">
                  {files.filesIncluded.map((file) => (
                    <FilePreviewDialog key={file.path} file={file} />
                  ))}
                </div>
                {files.filesOmitted.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {files.filesOmitted.map((f) => (
                      <li key={f.path} className="font-mono">
                        {f.path} — omitted ({f.reason === "binary" ? "non-reviewable file type" : "over context budget"})
                      </li>
                    ))}
                  </ul>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ evaluation }: { evaluation: AssignmentEvaluationResult }) {
  if (evaluation.status === "not_submitted") {
    return <Badge variant="outline">Not Submitted</Badge>;
  }
  if (evaluation.status === "error") {
    return <Badge variant="destructive">Error</Badge>;
  }
  return (
    <span className={`text-2xl font-semibold ${gradeColor(evaluation.data.overallGrade)}`}>
      {evaluation.data.overallGrade}
    </span>
  );
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
