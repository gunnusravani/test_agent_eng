import { z } from "zod";

export function isGitHubRepoUrl(url: string): boolean {
  return /^(?:https?:\/\/)?(?:www\.)?github\.com\/[^/\s]+\/[^/\s#?]+\/?(?:[#?].*)?$/i.test(url.trim());
}

export const repoUrlSchema = z.object({
  url: z
    .string()
    .min(1, "Enter a GitHub repository URL")
    .refine(isGitHubRepoUrl, "Must be a github.com repository URL, e.g. https://github.com/owner/repo"),
});

export const forkCheckSchema = z.object({
  expectedUpstream: z.string(),
  actualUpstream: z.string().nullable(),
  ok: z.boolean(),
});

export type ForkCheck = z.infer<typeof forkCheckSchema>;

/** Validation result for a single course/class submission (one repo, one class folder). */
export const singleClassValidationResultSchema = z.object({
  valid: z.boolean(),
  owner: z.string(),
  repo: z.string(),
  htmlUrl: z.string(),
  hasReadme: z.boolean(),
  hasMyWork: z.boolean(),
  hasClassFolder: z.boolean(),
  isFork: z.boolean(),
  parentFullName: z.string().nullable(),
  /** Only present when the class declares an expectedForkOf upstream. */
  forkCheck: forkCheckSchema.nullable(),
  errors: z.array(z.string()),
});

export type ValidationResult = z.infer<typeof singleClassValidationResultSchema>;

// Passed directly to the AI SDK's generateObject() as the target schema —
// this is what powers the retry-on-malformed-JSON loop in lib/evaluator.ts.
export const assignmentEvaluationSchema = z.object({
  scores: z.object({
    completeness: z.number().min(0).max(10),
    correctness: z.number().min(0).max(10),
    quality: z.number().min(0).max(10),
    novelty: z.number().min(0).max(10),
    understanding: z.number().min(0).max(10),
  }),
  overallGrade: z.enum(["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"]),
  confidence: z.number().min(0).max(1),
  feedback: z.object({
    summary: z.string(),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    missingFeatures: z.array(z.string()),
    recommendations: z.array(z.string()),
  }),
});

export type AssignmentEvaluation = z.infer<typeof assignmentEvaluationSchema>;
export type ScoreDimensions = AssignmentEvaluation["scores"];
export type LetterGrade = AssignmentEvaluation["overallGrade"];

export const gatheredFileSchema = z.object({
  path: z.string(),
  category: z.enum(["source", "markdown", "notebook", "binary", "other"]),
  content: z.string(),
  truncated: z.boolean(),
});

export type GatheredFileDto = z.infer<typeof gatheredFileSchema>;

export const omittedFileSchema = z.object({
  path: z.string(),
  sizeBytes: z.number().optional(),
  reason: z.enum(["binary", "budget"]),
});

export type OmittedFileDto = z.infer<typeof omittedFileSchema>;

export const classFilesSchema = z.object({
  filesIncluded: z.array(gatheredFileSchema),
  filesOmitted: z.array(omittedFileSchema),
});

export type ClassFilesDto = z.infer<typeof classFilesSchema>;

export const assignmentEvaluationResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    classId: z.string(),
    data: assignmentEvaluationSchema,
    evaluatedAt: z.string(),
    modelUsed: z.string(),
  }),
  z.object({
    status: z.literal("error"),
    classId: z.string(),
    message: z.string(),
  }),
]);

export type AssignmentEvaluationResult = z.infer<typeof assignmentEvaluationResultSchema>;

export const courseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
});

export type CourseDto = z.infer<typeof courseSchema>;

export const classSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  objective: z.string(),
  orderIndex: z.number(),
});

export type ClassSummaryDto = z.infer<typeof classSummarySchema>;

/** One row per class: student's best-ever score, most recent score, and how many times they've submitted. */
export const resultsRowSchema = z.object({
  classId: z.string(),
  classSlug: z.string(),
  classTitle: z.string(),
  maxGrade: assignmentEvaluationSchema.shape.overallGrade,
  maxScore: z.number(),
  latestGrade: assignmentEvaluationSchema.shape.overallGrade,
  latestScore: z.number(),
  attempts: z.number(),
});

export type ResultsRow = z.infer<typeof resultsRowSchema>;

/** One row per past submission — the full run-by-run history behind a ResultsRow's summary. */
export const attemptHistoryRowSchema = z.object({
  attemptId: z.string(),
  classSlug: z.string(),
  classTitle: z.string(),
  status: z.enum(["success", "error"]),
  weightedScore: z.number().nullable(),
  grade: assignmentEvaluationSchema.shape.overallGrade.nullable(),
  /** ISO timestamp — render with toLocaleString() client-side so it displays in the viewer's local time zone. */
  createdAt: z.string(),
});

export type AttemptHistoryRow = z.infer<typeof attemptHistoryRowSchema>;

export const resultsQuerySchema = z.object({
  githubUsername: z.string().min(1, "githubUsername is required"),
  courseSlug: z.string().optional(),
});

export type ResultsQuery = z.infer<typeof resultsQuerySchema>;

export const evaluateRequestSchema = z.object({
  courseSlug: z.string().min(1, "Course is required"),
  classSlug: z.string().min(1, "Class is required"),
  repoUrl: z
    .string()
    .min(1, "Enter a GitHub repository URL")
    .refine(isGitHubRepoUrl, "Must be a github.com repository URL, e.g. https://github.com/owner/repo"),
});

export type EvaluateRequest = z.infer<typeof evaluateRequestSchema>;

export const evaluateResponseSchema = z.object({
  validation: singleClassValidationResultSchema,
  evaluation: assignmentEvaluationResultSchema.optional(),
  /** Derived from the rubric-weighted average of evaluation.data.scores — the canonical score/grade, not evaluation.data.overallGrade. */
  weightedScore: z.number().nullable().optional(),
  files: classFilesSchema.optional(),
  resultsTable: z.array(resultsRowSchema).optional(),
  attemptHistory: z.array(attemptHistoryRowSchema).optional(),
  /** True when this is a prior attempt reused because the commit/class/assignment version/prompt/model exactly matched — no new LLM call was made. */
  cached: z.boolean().optional(),
});

export type EvaluateResponse = z.infer<typeof evaluateResponseSchema>;
