import { AssignmentCard } from "@/components/evaluator/assignment-card";
import { ExportButtons } from "@/components/evaluator/export-buttons";
import { MultiProjectResultCard } from "@/components/evaluator/multi-project-result-card";
import { MultiProjectExportButton } from "@/components/evaluator/multi-project-export-button";
import { Class03ResultCard } from "@/components/evaluator/class-03-result-card";
import { Class03ExportButton } from "@/components/evaluator/class-03-export-button";
import { ValidationChecklist } from "@/components/evaluator/validation-checklist";
import { ResultsTable } from "@/components/evaluator/results-table";
import { AttemptHistoryTable } from "@/components/evaluator/attempt-history-table";
import type {
  AssignmentEvaluationResult,
  AttemptHistoryRow,
  Class03EvaluationResult,
  ClassFilesDto,
  MultiProjectEvaluationResult,
  ResultsRow,
  ValidationResult,
} from "@/types/schemas";

export function Dashboard({
  validation,
  evaluation,
  multiProjectResult,
  class03Result,
  weightedScore,
  classTitle,
  files,
  resultsTable,
  attemptHistory,
}: {
  validation: ValidationResult;
  evaluation?: AssignmentEvaluationResult;
  multiProjectResult?: MultiProjectEvaluationResult;
  class03Result?: Class03EvaluationResult;
  weightedScore: number | null;
  classTitle: string;
  files?: ClassFilesDto;
  resultsTable: ResultsRow[];
  attemptHistory: AttemptHistoryRow[];
}) {
  return (
    <div className="space-y-6">
      <ValidationChecklist validation={validation} />

      {multiProjectResult ? (
        <>
          <MultiProjectResultCard evaluation={multiProjectResult} weightedScore={weightedScore} classTitle={classTitle} />
          <MultiProjectExportButton
            evaluation={multiProjectResult}
            owner={validation.owner}
            repo={validation.repo}
            classSlug={multiProjectResult.classId}
          />
        </>
      ) : class03Result ? (
        <>
          <Class03ResultCard evaluation={class03Result} weightedScore={weightedScore} classTitle={classTitle} />
          <Class03ExportButton
            evaluation={class03Result}
            owner={validation.owner}
            repo={validation.repo}
            classSlug={class03Result.classId}
          />
        </>
      ) : evaluation ? (
        <>
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
        </>
      ) : null}

      <ResultsTable rows={resultsTable} />

      <AttemptHistoryTable rows={attemptHistory} />
    </div>
  );
}
