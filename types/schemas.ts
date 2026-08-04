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

export const classChecklistItemSchema = z.object({
  classId: z.string(),
  present: z.boolean(),
  fileCount: z.number().optional(),
});

export const forkCheckSchema = z.object({
  expectedUpstream: z.string(),
  actualUpstream: z.string().nullable(),
  ok: z.boolean(),
});

export type ForkCheck = z.infer<typeof forkCheckSchema>;

export const validationResultSchema = z.object({
  valid: z.boolean(),
  owner: z.string(),
  repo: z.string(),
  htmlUrl: z.string(),
  hasReadme: z.boolean(),
  hasMyWork: z.boolean(),
  classes: z.array(classChecklistItemSchema),
  errors: z.array(z.string()),
  isFork: z.boolean(),
  parentFullName: z.string().nullable(),
  /** Only present when the configured class-01 assignment declares an expectedForkOf upstream. */
  forkCheck: forkCheckSchema.nullable(),
});

export type ValidationResult = z.infer<typeof validationResultSchema>;
export type ClassChecklistItem = z.infer<typeof classChecklistItemSchema>;

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
    status: z.literal("not_submitted"),
    classId: z.string(),
  }),
  z.object({
    status: z.literal("error"),
    classId: z.string(),
    message: z.string(),
  }),
]);

export type AssignmentEvaluationResult = z.infer<typeof assignmentEvaluationResultSchema>;

export const repositoryReportSchema = z.object({
  repository: z.object({ owner: z.string(), repo: z.string(), url: z.string() }),
  validation: validationResultSchema,
  classEvaluations: z.array(assignmentEvaluationResultSchema),
  classFiles: z.record(z.string(), classFilesSchema),
  aggregate: z.object({
    averageScores: assignmentEvaluationSchema.shape.scores,
    overallGrade: assignmentEvaluationSchema.shape.overallGrade,
    completionPercentage: z.number(),
    completedCount: z.number(),
    totalCount: z.number(),
    averageConfidence: z.number(),
  }),
  generatedAt: z.string(),
});

export type RepositoryReport = z.infer<typeof repositoryReportSchema>;

export const evaluateRequestSchema = repoUrlSchema;
export type EvaluateRequest = z.infer<typeof evaluateRequestSchema>;

export const evaluateResponseSchema = z.object({
  validation: validationResultSchema,
  report: repositoryReportSchema.optional(),
});

export type EvaluateResponse = z.infer<typeof evaluateResponseSchema>;
