import { OverallScoreCard } from "@/components/evaluator/overall-score-card";
import { AssignmentCard } from "@/components/evaluator/assignment-card";
import { ExportButtons } from "@/components/evaluator/export-buttons";
import { ValidationChecklist } from "@/components/evaluator/validation-checklist";
import type { RepositoryReport } from "@/types/schemas";

export function Dashboard({ report }: { report: RepositoryReport }) {
  return (
    <div className="space-y-6">
      <ValidationChecklist validation={report.validation} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <OverallScoreCard aggregate={report.aggregate} />
        </div>
      </div>

      <ExportButtons report={report} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {report.classEvaluations.map((evaluation) => (
          <AssignmentCard key={evaluation.classId} evaluation={evaluation} files={report.classFiles[evaluation.classId]} />
        ))}
      </div>
    </div>
  );
}
