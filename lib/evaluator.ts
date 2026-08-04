import pLimit from "p-limit";
import { generateObject, NoObjectGeneratedError } from "ai";
import { openai } from "@ai-sdk/openai";
import { assignmentEvaluationSchema, type AssignmentEvaluationResult, type RepositoryReport, type ValidationResult } from "@/types/schemas";
import type { AssignmentConfig, GatheredClass } from "@/types";
import { buildEvaluationPrompt, buildRetryPrompt, SYSTEM_PROMPT } from "./prompts";
import { averageScores, scoreToGrade, weightedAverage } from "./grades";
import { reportStore } from "./store";

const MODEL_NAME = process.env.OPENAI_MODEL ?? "gpt-4o";
const MAX_ATTEMPTS = 3;

export async function evaluateAssignment(params: {
  assignment: AssignmentConfig;
  gathered: GatheredClass;
}): Promise<AssignmentEvaluationResult> {
  const { assignment, gathered } = params;
  const classId = gathered.classId;

  let prompt = buildEvaluationPrompt({ assignment, gathered });
  let lastError: string = "Unknown error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { object } = await generateObject({
        model: openai(MODEL_NAME),
        schema: assignmentEvaluationSchema,
        system: SYSTEM_PROMPT,
        prompt,
      });

      return {
        status: "success",
        classId,
        data: object,
        evaluatedAt: new Date().toISOString(),
        modelUsed: MODEL_NAME,
      };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        lastError = error.cause instanceof Error ? error.cause.message : error.message;
        prompt = buildRetryPrompt(error.text ?? "", lastError);
        continue;
      }
      lastError = error instanceof Error ? error.message : "Unknown evaluation error";
      break;
    }
  }

  return { status: "error", classId, message: `Failed to evaluate after ${MAX_ATTEMPTS} attempts: ${lastError}` };
}

export async function evaluateRepository(params: {
  owner: string;
  repo: string;
  htmlUrl: string;
  validation: ValidationResult;
  gatheredClasses: GatheredClass[];
  assignments: Record<string, AssignmentConfig>;
}): Promise<RepositoryReport> {
  const { owner, repo, htmlUrl, validation, gatheredClasses, assignments } = params;

  const limit = pLimit(4);
  const classEvaluations: AssignmentEvaluationResult[] = await Promise.all(
    gatheredClasses.map((gathered) =>
      limit(async () => {
        if (!gathered.present) {
          return { status: "not_submitted" as const, classId: gathered.classId };
        }
        const assignment = assignments[gathered.classId];
        if (!assignment) {
          return {
            status: "error" as const,
            classId: gathered.classId,
            message: `No assignment configuration found for ${gathered.classId} in config/assignments.ts`,
          };
        }
        return evaluateAssignment({ assignment, gathered });
      }),
    ),
  );

  const successful = classEvaluations.filter((e) => e.status === "success");
  const avgScores = averageScores(successful.map((e) => e.data.scores));
  const overallGrade = scoreToGrade(weightedAverage(avgScores));
  const averageConfidence =
    successful.length > 0 ? successful.reduce((sum, e) => sum + e.data.confidence, 0) / successful.length : 0;

  const classFiles = Object.fromEntries(
    gatheredClasses
      .filter((g) => g.present)
      .map((g) => [g.classId, { filesIncluded: g.filesIncluded, filesOmitted: g.filesOmitted }]),
  );

  const report: RepositoryReport = {
    repository: { owner, repo, url: htmlUrl },
    validation,
    classEvaluations,
    classFiles,
    aggregate: {
      averageScores: avgScores,
      overallGrade,
      completionPercentage: (successful.length / classEvaluations.length) * 100,
      completedCount: successful.length,
      totalCount: classEvaluations.length,
      averageConfidence,
    },
    generatedAt: new Date().toISOString(),
  };

  await reportStore.saveReport(report);

  return report;
}
