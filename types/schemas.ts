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

// ---------------------------------------------------------------------------
// Multi-project grading (class-02 and any future codelab-style assignment —
// see lib/graders/class-02.ts). A parallel result shape to the evaluation
// schemas above, not a variant of them: this assignment doesn't have
// completeness/correctness/quality/novelty/understanding scores at all.
// ---------------------------------------------------------------------------

function projectScoreSchema(maxScore: number) {
  return z.object({
    score: z.number().min(0).max(maxScore),
    feedback: z.string(),
  });
}

// Passed directly to generateObject() as the target schema for the class-02 grader.
// maxScore/overallScore are deliberately absent here — they're fixed constants and a
// server-computed sum, not something an LLM should be asked to state or add up.
export const multiProjectEvaluationSchema = z.object({
  newsHighlights: projectScoreSchema(10),
  conferenceWebsite: projectScoreSchema(30),
  mockStubs: projectScoreSchema(20),
  pomodoroTimer: projectScoreSchema(25),
  readme: projectScoreSchema(15),
  bonus: z.object({
    score: z.number().min(0).max(10),
    features: z.array(z.string()),
  }),
  pass: z.boolean(),
  summary: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});

export type MultiProjectEvaluation = z.infer<typeof multiProjectEvaluationSchema>;

function scoredProjectResultSchema() {
  return z.object({
    score: z.number(),
    maxScore: z.number(),
    feedback: z.string(),
  });
}

/** The LLM's output enriched server-side with each project's fixed maxScore and the computed overallScore — what actually gets stored and returned. */
export const multiProjectResultSchema = z.object({
  newsHighlights: scoredProjectResultSchema(),
  conferenceWebsite: scoredProjectResultSchema(),
  mockStubs: scoredProjectResultSchema(),
  pomodoroTimer: scoredProjectResultSchema(),
  readme: scoredProjectResultSchema(),
  bonus: z.object({
    score: z.number(),
    features: z.array(z.string()),
  }),
  overallScore: z.number(),
  pass: z.boolean(),
  summary: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});

export type MultiProjectResult = z.infer<typeof multiProjectResultSchema>;

export const multiProjectEvaluationResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    classId: z.string(),
    data: multiProjectResultSchema,
    evaluatedAt: z.string(),
    modelUsed: z.string(),
  }),
  z.object({
    status: z.literal("error"),
    classId: z.string(),
    message: z.string(),
  }),
]);

export type MultiProjectEvaluationResult = z.infer<typeof multiProjectEvaluationResultSchema>;

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
  /** Feedback summary on success, the failure message on error; null if neither is available. */
  description: z.string().nullable(),
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
  /** Populated for classes graded by the standard 5-dimension rubric; mutually exclusive with multiProjectResult. */
  evaluation: assignmentEvaluationResultSchema.optional(),
  /** Populated for classes graded by a specialized multi-part grader (e.g. class-02); mutually exclusive with evaluation. */
  multiProjectResult: multiProjectEvaluationResultSchema.optional(),
  /** Derived from the rubric-weighted average of evaluation.data.scores (or overallScore/10 for multiProjectResult) — the canonical score/grade. */
  weightedScore: z.number().nullable().optional(),
  files: classFilesSchema.optional(),
  resultsTable: z.array(resultsRowSchema).optional(),
  attemptHistory: z.array(attemptHistoryRowSchema).optional(),
  /** True when this is a prior attempt reused because the commit/class/assignment version/prompt/model exactly matched — no new LLM call was made. */
  cached: z.boolean().optional(),
});

export type EvaluateResponse = z.infer<typeof evaluateResponseSchema>;

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const contentStatusSchema = z.enum(["draft", "published", "archived"]);

export const rubricWeightsSchema = z
  .object({
    completeness: z.number().int().min(0).max(100),
    correctness: z.number().int().min(0).max(100),
    quality: z.number().int().min(0).max(100),
    novelty: z.number().int().min(0).max(100),
    understanding: z.number().int().min(0).max(100),
  })
  .refine((w) => w.completeness + w.correctness + w.quality + w.novelty + w.understanding === 100, {
    message: "Rubric weights must sum to 100.",
  });

export type RubricWeights = z.infer<typeof rubricWeightsSchema>;

export const adminCreateCourseSchema = z.object({
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase, alphanumeric, hyphen-separated"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

export type AdminCreateCourseInput = z.infer<typeof adminCreateCourseSchema>;

export const adminUpdateCourseSchema = z.object({
  slug: adminCreateCourseSchema.shape.slug.optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: contentStatusSchema.optional(),
});

export type AdminUpdateCourseInput = z.infer<typeof adminUpdateCourseSchema>;

export const adminCreateClassSchema = z.object({
  courseId: z.string().min(1, "courseId is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase, alphanumeric, hyphen-separated"),
  title: z.string().min(1, "Title is required"),
  orderIndex: z.number().int().min(0),
  expectedForkOf: z.string().optional(),
});

export type AdminCreateClassInput = z.infer<typeof adminCreateClassSchema>;

export const adminUpdateClassSchema = z.object({
  slug: adminCreateClassSchema.shape.slug.optional(),
  title: z.string().min(1).optional(),
  orderIndex: z.number().int().min(0).optional(),
  expectedForkOf: z.string().nullable().optional(),
  status: contentStatusSchema.optional(),
});

export type AdminUpdateClassInput = z.infer<typeof adminUpdateClassSchema>;

const assignmentVersionFieldsSchema = z.object({
  title: z.string().min(1, "Title is required"),
  objective: z.string().min(1, "Objective is required"),
  expectedDeliverables: z.array(z.string().min(1)).min(1, "At least one expected deliverable is required"),
  expectedForkOf: z.string().optional(),
  rubricWeights: rubricWeightsSchema,
});

export const adminCreateAssignmentVersionSchema = assignmentVersionFieldsSchema.extend({
  classId: z.string().min(1, "classId is required"),
});

export type AdminCreateAssignmentVersionInput = z.infer<typeof adminCreateAssignmentVersionSchema>;

export const adminEditAssignmentVersionSchema = assignmentVersionFieldsSchema;

export type AdminEditAssignmentVersionInput = z.infer<typeof adminEditAssignmentVersionSchema>;

export const adminCourseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: contentStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});

export type AdminCourseDto = z.infer<typeof adminCourseSchema>;

export const adminClassSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  slug: z.string(),
  title: z.string(),
  orderIndex: z.number(),
  status: contentStatusSchema,
  expectedForkOf: z.string().nullable(),
  currentAssignmentVersionId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});

export type AdminClassDto = z.infer<typeof adminClassSchema>;

export const adminAssignmentVersionSchema = z.object({
  id: z.string(),
  classId: z.string(),
  versionNumber: z.number(),
  title: z.string(),
  objective: z.string(),
  expectedDeliverables: z.array(z.string()),
  expectedForkOf: z.string().nullable(),
  rubricWeights: z.object({
    completeness: z.number(),
    correctness: z.number(),
    quality: z.number(),
    novelty: z.number(),
    understanding: z.number(),
  }),
  createdAt: z.string(),
});

export type AdminAssignmentVersionDto = z.infer<typeof adminAssignmentVersionSchema>;

/** One row per (student, class) they've submitted to — the grid the admin students page is built from. */
export const adminStudentClassSummarySchema = z.object({
  studentId: z.string(),
  githubUsername: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  classId: z.string(),
  classSlug: z.string(),
  classTitle: z.string(),
  maxScore: z.number().nullable(),
  maxGrade: assignmentEvaluationSchema.shape.overallGrade.nullable(),
  latestScore: z.number().nullable(),
  latestGrade: assignmentEvaluationSchema.shape.overallGrade.nullable(),
  attempts: z.number(),
  lastAttemptAt: z.string(),
});

export type AdminStudentClassSummary = z.infer<typeof adminStudentClassSummarySchema>;

// ---------------------------------------------------------------------------
// Admin analytics dashboard
// ---------------------------------------------------------------------------

export const dashboardKpisSchema = z.object({
  totalStudents: z.number(),
  totalSubmissions: z.number(),
  passPercentage: z.number(),
  avgAttemptsPerClass: z.number(),
});

export const gradeDistributionBucketSchema = z.object({
  grade: assignmentEvaluationSchema.shape.overallGrade,
  count: z.number(),
});

export const courseAggregateSchema = z.object({
  courseId: z.string(),
  courseTitle: z.string(),
  avgScore: z.number().nullable(),
  attempts: z.number(),
});

export const submissionsByCourseSchema = z.object({
  courseId: z.string(),
  courseTitle: z.string(),
  count: z.number(),
});

export const attemptsByDaySchema = z.object({
  date: z.string(),
  count: z.number(),
});

export const classPerformanceRowSchema = z.object({
  classId: z.string(),
  classSlug: z.string(),
  classTitle: z.string(),
  courseTitle: z.string(),
  attempts: z.number(),
  passRate: z.number(),
  avgScore: z.number().nullable(),
});

export const recentSubmissionSchema = z.object({
  attemptId: z.string(),
  githubUsername: z.string(),
  courseTitle: z.string(),
  classTitle: z.string(),
  status: z.enum(["success", "error"]),
  grade: assignmentEvaluationSchema.shape.overallGrade.nullable(),
  weightedScore: z.number().nullable(),
  createdAt: z.string(),
});

export const dashboardAnalyticsSchema = z.object({
  kpis: dashboardKpisSchema,
  gradeDistribution: z.array(gradeDistributionBucketSchema),
  avgScorePerCourse: z.array(courseAggregateSchema),
  submissionsByCourse: z.array(submissionsByCourseSchema),
  attemptsOverTime: z.array(attemptsByDaySchema),
  classPerformance: z.array(classPerformanceRowSchema),
  recentSubmissions: z.array(recentSubmissionSchema),
});

export type DashboardAnalytics = z.infer<typeof dashboardAnalyticsSchema>;
