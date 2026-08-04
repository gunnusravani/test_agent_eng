import { AssignmentCard } from "@/components/evaluator/assignment-card";
import { ExportButtons } from "@/components/evaluator/export-buttons";
import { ValidationChecklist } from "@/components/evaluator/validation-checklist";
import { ResultsTable } from "@/components/evaluator/results-table";
import { AttemptHistoryTable } from "@/components/evaluator/attempt-history-table";
import type { AssignmentEvaluationResult, AttemptHistoryRow, ClassFilesDto, ResultsRow, ValidationResult } from "@/types/schemas";

export function Dashboard({
  validation,
  evaluation,
  weightedScore,
  classTitle,
  files,
  resultsTable,
  attemptHistory,
}: {
  validation: ValidationResult;
  evaluation: AssignmentEvaluationResult;
  weightedScore: number | null;
  classTitle: string;
  files?: ClassFilesDto;
  resultsTable: ResultsRow[];
  attemptHistory: AttemptHistoryRow[];
}) {
  return (
    <div className="space-y-6">
      <ValidationChecklist validation={validation} />

      <AssignmentCard evaluation={evaluation} weightedScore={weightedScore} classTitle={classTitle} files={files} />

      <ExportButtons
        context={{
          owner: validation.owner,
          repo: validation.repo,
          classSlug: evaluation.classId,
          classTitle,
          evaluation,
          weightedScore,
        }}
      />

      <ResultsTable rows={resultsTable} />

      <AttemptHistoryTable rows={attemptHistory} />
    </div>
  );
}
