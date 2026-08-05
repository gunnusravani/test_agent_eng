import { AssignmentCard } from "@/components/evaluator/assignment-card";
import { ExportButtons } from "@/components/evaluator/export-buttons";
import { MultiProjectResultCard } from "@/components/evaluator/multi-project-result-card";
import { MultiProjectExportButton } from "@/components/evaluator/multi-project-export-button";
import { ValidationChecklist } from "@/components/evaluator/validation-checklist";
import { ResultsTable } from "@/components/evaluator/results-table";
import { AttemptHistoryTable } from "@/components/evaluator/attempt-history-table";
import type {
  AssignmentEvaluationResult,
  AttemptHistoryRow,
  ClassFilesDto,
  MultiProjectEvaluationResult,
  ResultsRow,
  ValidationResult,
} from "@/types/schemas";

export function Dashboard({
  validation,
  evaluation,
  multiProjectResult,
  weightedScore,
  classTitle,
  files,
  resultsTable,
  attemptHistory,
}: {
  validation: ValidationResult;
  evaluation?: AssignmentEvaluationResult;
  multiProjectResult?: MultiProjectEvaluationResult;
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
