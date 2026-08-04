import type { AssignmentEvaluation, ScoreDimensions } from "@/types/schemas";

export const DIMENSION_WEIGHTS: Record<keyof ScoreDimensions, number> = {
  completeness: 0.2,
  correctness: 0.2,
  quality: 0.2,
  novelty: 0.2,
  understanding: 0.2,
};

const GRADE_THRESHOLDS: Array<{ min: number; grade: AssignmentEvaluation["overallGrade"] }> = [
  { min: 9.7, grade: "A+" },
  { min: 9.0, grade: "A" },
  { min: 8.3, grade: "A-" },
  { min: 7.7, grade: "B+" },
  { min: 7.0, grade: "B" },
  { min: 6.3, grade: "B-" },
  { min: 5.7, grade: "C+" },
  { min: 5.0, grade: "C" },
  { min: 4.3, grade: "C-" },
  { min: 3.0, grade: "D" },
  { min: 0, grade: "F" },
];

/** Converts a 0-10 weighted average into a letter grade. */
export function scoreToGrade(weightedAverage: number): AssignmentEvaluation["overallGrade"] {
  const match = GRADE_THRESHOLDS.find((t) => weightedAverage >= t.min);
  return match?.grade ?? "F";
}

/** C- and above (matches GRADE_THRESHOLDS) counts as passing for analytics; D/F and errored attempts don't. */
export const PASSING_SCORE_THRESHOLD = 4.3;

export function isPassingScore(weightedScore: number | null): boolean {
  return weightedScore != null && weightedScore >= PASSING_SCORE_THRESHOLD;
}

export function weightedAverage(
  scores: ScoreDimensions,
  weights: Record<keyof ScoreDimensions, number> = DIMENSION_WEIGHTS,
): number {
  const keys = Object.keys(weights) as Array<keyof ScoreDimensions>;
  const total = keys.reduce((sum, key) => sum + scores[key] * weights[key], 0);
  const weightSum = keys.reduce((sum, key) => sum + weights[key], 0);
  return total / weightSum;
}

/** Maps a 0-10 score to a 0-100 percentage for progress bars. */
export function scoreToPercent(score: number): number {
  return Math.round((score / 10) * 100);
}

const GRADE_COLOR_MAP: Record<AssignmentEvaluation["overallGrade"], string> = {
  "A+": "text-emerald-600 dark:text-emerald-400",
  A: "text-emerald-600 dark:text-emerald-400",
  "A-": "text-emerald-600 dark:text-emerald-400",
  "B+": "text-sky-600 dark:text-sky-400",
  B: "text-sky-600 dark:text-sky-400",
  "B-": "text-sky-600 dark:text-sky-400",
  "C+": "text-amber-600 dark:text-amber-400",
  C: "text-amber-600 dark:text-amber-400",
  "C-": "text-amber-600 dark:text-amber-400",
  D: "text-orange-600 dark:text-orange-400",
  F: "text-red-600 dark:text-red-400",
};

export function gradeColor(grade: AssignmentEvaluation["overallGrade"]): string {
  return GRADE_COLOR_MAP[grade] ?? "text-foreground";
}
