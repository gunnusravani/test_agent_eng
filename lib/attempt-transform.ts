import { scoreToGrade } from "@/lib/grades";
import type { Attempt } from "@/lib/db/schema";
import type {
  AssignmentEvaluationResult,
  Class02aEvaluationResult,
  Class02aResult,
  Class02bEvaluationResult,
  Class02bResult,
  Class03EvaluationResult,
  Class03Result,
  MultiProjectEvaluationResult,
  MultiProjectResult,
} from "@/types/schemas";

/**
 * Reconstructs the API response shape for a stored attempt (a same-commit resubmission, or a
 * "view previous submission" lookup). The LLM's own raw overallGrade isn't persisted on attempts
 * (the app always derives the canonical grade from weightedScore, see lib/grades.ts), so it's
 * recomputed the same way here; nothing downstream reads this field directly.
 */
export function attemptToEvaluationResult(attempt: Attempt, classSlug: string): AssignmentEvaluationResult {
  if (attempt.status === "error") {
    return { status: "error", classId: classSlug, message: attempt.errorMessage ?? "Unknown error" };
  }
  return {
    status: "success",
    classId: classSlug,
    data: {
      scores: {
        completeness: attempt.completeness!,
        correctness: attempt.correctness!,
        quality: attempt.quality!,
        novelty: attempt.novelty!,
        understanding: attempt.understanding!,
      },
      overallGrade: scoreToGrade(attempt.weightedScore ?? 0),
      confidence: attempt.confidence!,
      feedback: attempt.feedbackJson!,
    },
    evaluatedAt: attempt.createdAt.toISOString(),
    modelUsed: attempt.modelName,
  };
}

/** Same idea as attemptToEvaluationResult, for classes graded by a specialized multi-part grader. */
export function attemptToMultiProjectResult(attempt: Attempt, classSlug: string): MultiProjectEvaluationResult {
  if (attempt.status === "error") {
    return { status: "error", classId: classSlug, message: attempt.errorMessage ?? "Unknown error" };
  }
  return {
    status: "success",
    classId: classSlug,
    data: attempt.structuredResult! as MultiProjectResult,
    evaluatedAt: attempt.createdAt.toISOString(),
    modelUsed: attempt.modelName,
  };
}

/** Same idea as attemptToEvaluationResult, for class-03 (WidgetWare context package grader). */
export function attemptToClass03Result(attempt: Attempt, classSlug: string): Class03EvaluationResult {
  if (attempt.status === "error") {
    return { status: "error", classId: classSlug, message: attempt.errorMessage ?? "Unknown error" };
  }
  return {
    status: "success",
    classId: classSlug,
    data: attempt.structuredResult! as Class03Result,
    evaluatedAt: attempt.createdAt.toISOString(),
    modelUsed: attempt.modelName,
  };
}

/** Same idea as attemptToEvaluationResult, for class-02a (WidgetWare Renewal Desk skill grader). */
export function attemptToClass02aResult(attempt: Attempt, classSlug: string): Class02aEvaluationResult {
  if (attempt.status === "error") {
    return { status: "error", classId: classSlug, message: attempt.errorMessage ?? "Unknown error" };
  }
  return {
    status: "success",
    classId: classSlug,
    data: attempt.structuredResult! as Class02aResult,
    evaluatedAt: attempt.createdAt.toISOString(),
    modelUsed: attempt.modelName,
  };
}

/** Same idea as attemptToEvaluationResult, for class-02b (ADK multi-agent workflows grader). */
export function attemptToClass02bResult(attempt: Attempt, classSlug: string): Class02bEvaluationResult {
  if (attempt.status === "error") {
    return { status: "error", classId: classSlug, message: attempt.errorMessage ?? "Unknown error" };
  }
  return {
    status: "success",
    classId: classSlug,
    data: attempt.structuredResult! as Class02bResult,
    evaluatedAt: attempt.createdAt.toISOString(),
    modelUsed: attempt.modelName,
  };
}
