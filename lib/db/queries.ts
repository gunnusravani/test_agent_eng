import { and, eq, sql } from "drizzle-orm";
import { PASSING_SCORE_THRESHOLD, scoreToGrade } from "@/lib/grades";
import type { AttemptHistoryRow, DashboardAnalytics, LetterGrade, ResultsRow } from "@/types/schemas";
import { db } from "./client";
import {
  courses,
  classes,
  assignmentVersions,
  students,
  attempts,
  auditLog,
  type Course,
  type Class,
  type AssignmentVersion,
  type Student,
  type Attempt,
} from "./schema";

export interface CreateCourseInput {
  slug: string;
  title: string;
  description?: string;
  status?: "draft" | "published" | "archived";
}

export async function createCourse(input: CreateCourseInput): Promise<Course> {
  const [course] = await db.insert(courses).values(input).returning();
  return course;
}

export interface CreateClassInput {
  courseId: string;
  slug: string;
  title: string;
  orderIndex: number;
  status?: "draft" | "published" | "archived";
  expectedForkOf?: string;
}

export async function createClass(input: CreateClassInput): Promise<Class> {
  const [classRow] = await db.insert(classes).values(input).returning();
  return classRow;
}

export interface CreateAssignmentVersionInput {
  classId: string;
  versionNumber: number;
  title: string;
  objective: string;
  expectedDeliverables: string[];
  expectedForkOf?: string;
  rubricWeights: {
    completeness: number;
    correctness: number;
    quality: number;
    novelty: number;
    understanding: number;
  };
}

export async function createAssignmentVersion(input: CreateAssignmentVersionInput): Promise<AssignmentVersion> {
  const [version] = await db.insert(assignmentVersions).values(input).returning();
  return version;
}

/**
 * Creates a new assignment version and repoints the owning class's
 * currentAssignmentVersionId to it, atomically. This is the only path that
 * writes classes.currentAssignmentVersionId (see the no-FK note on that
 * column in lib/db/schema.ts) — reused unchanged by the Phase 3 "edit
 * assignment" admin action, which is just this function called again with a
 * bumped versionNumber.
 */
export async function createAssignmentVersionAndActivate(
  input: CreateAssignmentVersionInput,
): Promise<AssignmentVersion> {
  return db.transaction(async (tx) => {
    const [version] = await tx.insert(assignmentVersions).values(input).returning();
    await tx.update(classes).set({ currentAssignmentVersionId: version.id, updatedAt: new Date() }).where(eq(classes.id, input.classId));
    return version;
  });
}

export async function getCourseBySlug(slug: string): Promise<Course | null> {
  const [course] = await db.select().from(courses).where(eq(courses.slug, slug)).limit(1);
  return course ?? null;
}

export async function listClassesByCourse(courseId: string): Promise<Class[]> {
  return db.select().from(classes).where(eq(classes.courseId, courseId)).orderBy(classes.orderIndex);
}

// ---------------------------------------------------------------------------
// Phase 2 — public evaluate/results flow
// ---------------------------------------------------------------------------

export async function getPublishedCourses(): Promise<Course[]> {
  return db.select().from(courses).where(eq(courses.status, "published")).orderBy(courses.title);
}

export interface ClassSummaryRow {
  id: string;
  slug: string;
  title: string;
  objective: string;
  orderIndex: number;
}

/** Returns null if the course doesn't exist or isn't published. */
export async function getPublishedClassesByCourseSlug(courseSlug: string): Promise<ClassSummaryRow[] | null> {
  const course = await getCourseBySlug(courseSlug);
  if (!course || course.status !== "published") return null;

  return db
    .select({
      id: classes.id,
      slug: classes.slug,
      title: classes.title,
      orderIndex: classes.orderIndex,
      objective: assignmentVersions.objective,
    })
    .from(classes)
    .innerJoin(assignmentVersions, eq(classes.currentAssignmentVersionId, assignmentVersions.id))
    .where(and(eq(classes.courseId, course.id), eq(classes.status, "published")))
    .orderBy(classes.orderIndex);
}

export interface ClassForEvaluation {
  course: Course;
  classRow: Class;
  assignmentVersion: AssignmentVersion;
}

/** Looks up a class ready for grading. Returns null if the course/class is missing, unpublished, or has no active assignment version. */
export async function getClassForEvaluation(courseSlug: string, classSlug: string): Promise<ClassForEvaluation | null> {
  const course = await getCourseBySlug(courseSlug);
  if (!course || course.status !== "published") return null;

  const [classRow] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.courseId, course.id), eq(classes.slug, classSlug)))
    .limit(1);
  if (!classRow || classRow.status !== "published" || !classRow.currentAssignmentVersionId) return null;

  const [assignmentVersion] = await db
    .select()
    .from(assignmentVersions)
    .where(eq(assignmentVersions.id, classRow.currentAssignmentVersionId))
    .limit(1);
  if (!assignmentVersion) return null;

  return { course, classRow, assignmentVersion };
}

/** Case-insensitive get-or-create keyed on githubUsernameLower; safe under concurrent first-submissions from the same user. */
export async function getOrCreateStudent(githubUsername: string): Promise<Student> {
  const inserted = await db
    .insert(students)
    .values({ githubUsername })
    .onConflictDoNothing({ target: students.githubUsernameLower })
    .returning();
  if (inserted[0]) return inserted[0];

  const [existing] = await db
    .select()
    .from(students)
    .where(eq(students.githubUsernameLower, githubUsername.toLowerCase()))
    .limit(1);
  if (!existing) throw new Error(`Failed to create or find student "${githubUsername}".`);
  return existing;
}

export interface InsertAttemptInput {
  studentId: string;
  classId: string;
  assignmentVersionId: string;
  repoUrl: string;
  commitSha: string;
  status: "success" | "error";
  completeness?: number | null;
  correctness?: number | null;
  quality?: number | null;
  novelty?: number | null;
  understanding?: number | null;
  weightedScore?: number | null;
  confidence?: number | null;
  feedbackJson?: Attempt["feedbackJson"];
  errorMessage?: string | null;
  promptVersion: string;
  modelName: string;
}

export async function insertAttempt(input: InsertAttemptInput): Promise<Attempt> {
  const [attempt] = await db.insert(attempts).values(input).returning();
  return attempt;
}

/**
 * Looks for a prior attempt at the exact same (student, class, commit, assignment version,
 * prompt version, model) combination — i.e. nothing has changed since the last submission of
 * this exact code under these exact grading criteria. Callers use this to skip re-running the
 * LLM and creating a duplicate row on a no-op resubmit; a new commit, a new assignment version,
 * a bumped prompt version, or a different model still always produces a fresh attempt.
 */
export async function findExistingAttempt(params: {
  studentId: string;
  classId: string;
  commitSha: string;
  assignmentVersionId: string;
  promptVersion: string;
  modelName: string;
}): Promise<Attempt | null> {
  const [existing] = await db
    .select()
    .from(attempts)
    .where(
      and(
        eq(attempts.studentId, params.studentId),
        eq(attempts.classId, params.classId),
        eq(attempts.commitSha, params.commitSha),
        eq(attempts.assignmentVersionId, params.assignmentVersionId),
        eq(attempts.promptVersion, params.promptVersion),
        eq(attempts.modelName, params.modelName),
      ),
    )
    .orderBy(sql`${attempts.createdAt} desc`)
    .limit(1);
  return existing ?? null;
}

interface ResultsQueryRow extends Record<string, unknown> {
  class_id: string;
  class_slug: string;
  class_title: string;
  max_score: number;
  latest_score: number;
  attempt_count: number;
}

/**
 * One row per class the student has ever submitted to (classes with only
 * failed attempts and no successful score are omitted, since there's no
 * grade to show). Max/latest score come from successful attempts only;
 * attempt_count counts every submission, success or error. Computed as one
 * SQL query with window functions, not an app-layer loop over all attempts.
 */
export async function getResultsForStudent(githubUsername: string, courseSlug?: string): Promise<ResultsRow[]> {
  const [student] = await db
    .select()
    .from(students)
    .where(eq(students.githubUsernameLower, githubUsername.toLowerCase()))
    .limit(1);
  if (!student) return [];

  const result = await db.execute<ResultsQueryRow>(sql`
    WITH successful AS (
      SELECT
        a.class_id,
        a.weighted_score,
        a.created_at,
        MAX(a.weighted_score) OVER (PARTITION BY a.class_id) AS max_score,
        ROW_NUMBER() OVER (PARTITION BY a.class_id ORDER BY a.created_at DESC) AS rn
      FROM attempts a
      WHERE a.student_id = ${student.id} AND a.status = 'success'
    ),
    counts AS (
      SELECT class_id, COUNT(*)::int AS attempt_count
      FROM attempts
      WHERE student_id = ${student.id}
      GROUP BY class_id
    )
    SELECT
      c.id AS class_id,
      c.slug AS class_slug,
      c.title AS class_title,
      s.max_score,
      s.weighted_score AS latest_score,
      cnt.attempt_count
    FROM successful s
    JOIN counts cnt ON cnt.class_id = s.class_id
    JOIN classes c ON c.id = s.class_id
    JOIN courses co ON co.id = c.course_id
    WHERE s.rn = 1
    ${courseSlug ? sql`AND co.slug = ${courseSlug}` : sql``}
    ORDER BY c.order_index
  `);

  return result.rows.map((row) => ({
    classId: row.class_id,
    classSlug: row.class_slug,
    classTitle: row.class_title,
    maxScore: row.max_score,
    maxGrade: scoreToGrade(row.max_score),
    latestScore: row.latest_score,
    latestGrade: scoreToGrade(row.latest_score),
    attempts: row.attempt_count,
  }));
}

/** Every attempt the student has ever made (success or error), newest first — the raw run-by-run history behind the summary in getResultsForStudent. */
export async function getAttemptHistoryForStudent(githubUsername: string, courseSlug?: string): Promise<AttemptHistoryRow[]> {
  const [student] = await db
    .select()
    .from(students)
    .where(eq(students.githubUsernameLower, githubUsername.toLowerCase()))
    .limit(1);
  if (!student) return [];

  const rows = await db
    .select({
      attemptId: attempts.id,
      classSlug: classes.slug,
      classTitle: classes.title,
      status: attempts.status,
      weightedScore: attempts.weightedScore,
      feedbackJson: attempts.feedbackJson,
      errorMessage: attempts.errorMessage,
      createdAt: attempts.createdAt,
    })
    .from(attempts)
    .innerJoin(classes, eq(classes.id, attempts.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .where(courseSlug ? and(eq(attempts.studentId, student.id), eq(courses.slug, courseSlug)) : eq(attempts.studentId, student.id))
    .orderBy(sql`${attempts.createdAt} desc`);

  return rows.map((row) => ({
    attemptId: row.attemptId,
    classSlug: row.classSlug,
    classTitle: row.classTitle,
    status: row.status,
    weightedScore: row.weightedScore,
    grade: row.weightedScore != null ? scoreToGrade(row.weightedScore) : null,
    description: row.status === "success" ? (row.feedbackJson?.summary ?? null) : row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Phase 3 — admin CRUD
// ---------------------------------------------------------------------------

export type ContentStatus = "draft" | "published" | "archived";

export interface InsertAuditLogInput {
  action: "create" | "update" | "archive" | "unarchive" | "publish" | "unpublish" | "rubric_update";
  entityType: "course" | "class" | "assignment_version";
  entityId: string | null;
  details?: unknown;
}

export async function insertAuditLog(input: InsertAuditLogInput): Promise<void> {
  await db.insert(auditLog).values({
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    details: input.details ?? null,
  });
}

export async function listCoursesAdmin(): Promise<Course[]> {
  return db.select().from(courses).orderBy(courses.title);
}

export async function getCourseById(id: string): Promise<Course | null> {
  const [course] = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
  return course ?? null;
}

export interface UpdateCourseInput {
  slug?: string;
  title?: string;
  description?: string | null;
  status?: ContentStatus;
}

export async function updateCourse(id: string, patch: UpdateCourseInput): Promise<Course> {
  const [course] = await db
    .update(courses)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(courses.id, id))
    .returning();
  return course;
}

export async function archiveCourse(id: string): Promise<Course> {
  const [course] = await db
    .update(courses)
    .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(courses.id, id))
    .returning();
  return course;
}

export async function listClassesAdmin(courseId: string): Promise<Class[]> {
  return db.select().from(classes).where(eq(classes.courseId, courseId)).orderBy(classes.orderIndex);
}

export async function getClassById(id: string): Promise<Class | null> {
  const [classRow] = await db.select().from(classes).where(eq(classes.id, id)).limit(1);
  return classRow ?? null;
}

export interface UpdateClassInput {
  slug?: string;
  title?: string;
  orderIndex?: number;
  expectedForkOf?: string | null;
  status?: ContentStatus;
}

export async function updateClass(id: string, patch: UpdateClassInput): Promise<Class> {
  const [classRow] = await db
    .update(classes)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(classes.id, id))
    .returning();
  return classRow;
}

export async function archiveClass(id: string): Promise<Class> {
  const [classRow] = await db
    .update(classes)
    .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(classes.id, id))
    .returning();
  return classRow;
}

/** Full version history for a class, newest first. */
export async function listAssignmentVersions(classId: string): Promise<AssignmentVersion[]> {
  return db
    .select()
    .from(assignmentVersions)
    .where(eq(assignmentVersions.classId, classId))
    .orderBy(sql`${assignmentVersions.versionNumber} desc`);
}

export async function getAssignmentVersion(id: string): Promise<AssignmentVersion | null> {
  const [version] = await db.select().from(assignmentVersions).where(eq(assignmentVersions.id, id)).limit(1);
  return version ?? null;
}

export async function getNextVersionNumber(classId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${assignmentVersions.versionNumber}), 0)` })
    .from(assignmentVersions)
    .where(eq(assignmentVersions.classId, classId));
  return (row?.max ?? 0) + 1;
}

interface StudentClassSummaryQueryRow extends Record<string, unknown> {
  student_id: string;
  github_username: string;
  course_id: string;
  course_title: string;
  class_id: string;
  class_slug: string;
  class_title: string;
  max_score: number | null;
  latest_score: number | null;
  attempt_count: number;
  last_attempt_at: string;
  total_count: number;
}

export interface StudentClassSummaryRow {
  studentId: string;
  githubUsername: string;
  courseId: string;
  courseTitle: string;
  classId: string;
  classSlug: string;
  classTitle: string;
  maxScore: number | null;
  maxGrade: LetterGrade | null;
  latestScore: number | null;
  latestGrade: LetterGrade | null;
  attempts: number;
  lastAttemptAt: string;
}

/**
 * One row per (student, class) they've submitted to — every submission, success or error, counts
 * toward `attempts`, but max/latest score+grade only reflect successful attempts (null if the
 * student has only ever errored on that class). Optionally filtered by a case-insensitive
 * substring match on githubUsername and/or a specific course/class.
 */
export async function listStudentClassSummaries(params: {
  search?: string;
  courseId?: string;
  classId?: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: StudentClassSummaryRow[]; total: number }> {
  const { search, courseId, classId, page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const searchFilter = search ? sql`AND s.github_username ILIKE ${`%${search}%`}` : sql``;
  const courseFilter = courseId ? sql`AND co.id = ${courseId}` : sql``;
  const classFilter = classId ? sql`AND c.id = ${classId}` : sql``;

  const result = await db.execute<StudentClassSummaryQueryRow>(sql`
    WITH successful AS (
      SELECT
        a.student_id,
        a.class_id,
        a.weighted_score,
        a.created_at,
        MAX(a.weighted_score) OVER (PARTITION BY a.student_id, a.class_id) AS max_score,
        ROW_NUMBER() OVER (PARTITION BY a.student_id, a.class_id ORDER BY a.created_at DESC) AS rn
      FROM attempts a
      WHERE a.status = 'success'
    ),
    counts AS (
      SELECT student_id, class_id, COUNT(*)::int AS attempt_count, MAX(created_at) AS last_attempt_at
      FROM attempts
      GROUP BY student_id, class_id
    )
    SELECT
      s.id AS student_id,
      s.github_username,
      co.id AS course_id,
      co.title AS course_title,
      c.id AS class_id,
      c.slug AS class_slug,
      c.title AS class_title,
      suc.max_score,
      suc.weighted_score AS latest_score,
      cnt.attempt_count,
      cnt.last_attempt_at,
      COUNT(*) OVER()::int AS total_count
    FROM counts cnt
    JOIN students s ON s.id = cnt.student_id
    JOIN classes c ON c.id = cnt.class_id
    JOIN courses co ON co.id = c.course_id
    LEFT JOIN successful suc ON suc.student_id = cnt.student_id AND suc.class_id = cnt.class_id AND suc.rn = 1
    WHERE true ${searchFilter} ${courseFilter} ${classFilter}
    ORDER BY cnt.last_attempt_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  return {
    total: result.rows[0]?.total_count ?? 0,
    rows: result.rows.map((row) => ({
      studentId: row.student_id,
      githubUsername: row.github_username,
      courseId: row.course_id,
      courseTitle: row.course_title,
      classId: row.class_id,
      classSlug: row.class_slug,
      classTitle: row.class_title,
      maxScore: row.max_score,
      maxGrade: row.max_score != null ? scoreToGrade(row.max_score) : null,
      latestScore: row.latest_score,
      latestGrade: row.latest_score != null ? scoreToGrade(row.latest_score) : null,
      attempts: row.attempt_count,
      lastAttemptAt: new Date(row.last_attempt_at).toISOString(),
    })),
  };
}

export async function getStudentByUsername(githubUsername: string): Promise<Student | null> {
  const [student] = await db
    .select()
    .from(students)
    .where(eq(students.githubUsernameLower, githubUsername.toLowerCase()))
    .limit(1);
  return student ?? null;
}

// ---------------------------------------------------------------------------
// Phase 4 — admin analytics dashboard
// ---------------------------------------------------------------------------

const ALL_GRADES: LetterGrade[] = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"];

interface KpiQueryRow extends Record<string, unknown> {
  total_students: number;
  total_submissions: number;
  pass_percentage: number;
  avg_attempts_per_class: number;
}

interface CourseAggregateQueryRow extends Record<string, unknown> {
  course_id: string;
  course_title: string;
  avg_score: number | null;
  attempts: number;
}

interface SubmissionsByCourseQueryRow extends Record<string, unknown> {
  course_id: string;
  course_title: string;
  count: number;
}

interface AttemptsByDayQueryRow extends Record<string, unknown> {
  date: string;
  count: number;
}

interface ClassPerformanceQueryRow extends Record<string, unknown> {
  class_id: string;
  class_slug: string;
  class_title: string;
  course_title: string;
  attempts: number;
  pass_rate: number;
  avg_score: number | null;
}

interface RecentSubmissionQueryRow extends Record<string, unknown> {
  attempt_id: string;
  github_username: string;
  course_title: string;
  class_title: string;
  status: "success" | "error";
  weighted_score: number | null;
  created_at: string;
}

/**
 * Everything the admin analytics dashboard needs, computed as a handful of SQL
 * aggregates run in parallel — never an app-layer loop over all attempts. Grade
 * bucketing pulls raw scores and buckets them in JS via scoreToGrade so grade
 * thresholds stay single-sourced in lib/grades.ts instead of duplicated as SQL
 * CASE WHEN (same rationale as getResultsForStudent).
 */
export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  const [kpiResult, gradeScoresResult, avgScoreResult, submissionsByCourseResult, attemptsByDayResult, classPerfResult, recentResult] =
    await Promise.all([
      db.execute<KpiQueryRow>(sql`
        SELECT
          (SELECT count(*) FROM students)::int AS total_students,
          (SELECT count(*) FROM attempts)::int AS total_submissions,
          COALESCE((SELECT count(*) FILTER (WHERE weighted_score >= ${PASSING_SCORE_THRESHOLD})::float / NULLIF(count(*), 0) * 100 FROM attempts), 0) AS pass_percentage,
          COALESCE((SELECT count(*)::float / NULLIF(count(DISTINCT class_id), 0) FROM attempts), 0) AS avg_attempts_per_class
      `),
      db.execute<{ weighted_score: number }>(sql`
        SELECT weighted_score FROM attempts WHERE status = 'success' AND weighted_score IS NOT NULL
      `),
      db.execute<CourseAggregateQueryRow>(sql`
        SELECT co.id AS course_id, co.title AS course_title, AVG(a.weighted_score) AS avg_score, COUNT(*)::int AS attempts
        FROM attempts a
        JOIN classes c ON c.id = a.class_id
        JOIN courses co ON co.id = c.course_id
        WHERE a.status = 'success' AND a.weighted_score IS NOT NULL
        GROUP BY co.id, co.title
        ORDER BY co.title
      `),
      db.execute<SubmissionsByCourseQueryRow>(sql`
        SELECT co.id AS course_id, co.title AS course_title, COUNT(*)::int AS count
        FROM attempts a
        JOIN classes c ON c.id = a.class_id
        JOIN courses co ON co.id = c.course_id
        GROUP BY co.id, co.title
        ORDER BY count DESC
      `),
      db.execute<AttemptsByDayQueryRow>(sql`
        SELECT gs.day::date::text AS date, COUNT(a.id)::int AS count
        FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS gs(day)
        LEFT JOIN attempts a ON a.created_at::date = gs.day::date
        GROUP BY gs.day
        ORDER BY gs.day
      `),
      db.execute<ClassPerformanceQueryRow>(sql`
        SELECT
          c.id AS class_id, c.slug AS class_slug, c.title AS class_title, co.title AS course_title,
          COUNT(a.id)::int AS attempts,
          COALESCE(COUNT(*) FILTER (WHERE a.weighted_score >= ${PASSING_SCORE_THRESHOLD})::float / NULLIF(COUNT(a.id), 0) * 100, 0) AS pass_rate,
          AVG(a.weighted_score) FILTER (WHERE a.status = 'success') AS avg_score
        FROM classes c
        JOIN courses co ON co.id = c.course_id
        LEFT JOIN attempts a ON a.class_id = c.id
        GROUP BY c.id, c.slug, c.title, co.title
        HAVING COUNT(a.id) > 0
        ORDER BY attempts DESC
      `),
      db.execute<RecentSubmissionQueryRow>(sql`
        SELECT a.id AS attempt_id, s.github_username, co.title AS course_title, c.title AS class_title,
          a.status, a.weighted_score, a.created_at
        FROM attempts a
        JOIN students s ON s.id = a.student_id
        JOIN classes c ON c.id = a.class_id
        JOIN courses co ON co.id = c.course_id
        ORDER BY a.created_at DESC
        LIMIT 10
      `),
    ]);

  const gradeCounts = new Map<LetterGrade, number>(ALL_GRADES.map((g) => [g, 0]));
  for (const row of gradeScoresResult.rows) {
    const grade = scoreToGrade(row.weighted_score);
    gradeCounts.set(grade, (gradeCounts.get(grade) ?? 0) + 1);
  }

  const kpiRow = kpiResult.rows[0];

  return {
    kpis: {
      totalStudents: kpiRow?.total_students ?? 0,
      totalSubmissions: kpiRow?.total_submissions ?? 0,
      passPercentage: kpiRow?.pass_percentage ?? 0,
      avgAttemptsPerClass: kpiRow?.avg_attempts_per_class ?? 0,
    },
    gradeDistribution: ALL_GRADES.map((grade) => ({ grade, count: gradeCounts.get(grade) ?? 0 })),
    avgScorePerCourse: avgScoreResult.rows.map((row) => ({
      courseId: row.course_id,
      courseTitle: row.course_title,
      avgScore: row.avg_score,
      attempts: row.attempts,
    })),
    submissionsByCourse: submissionsByCourseResult.rows.map((row) => ({
      courseId: row.course_id,
      courseTitle: row.course_title,
      count: row.count,
    })),
    attemptsOverTime: attemptsByDayResult.rows.map((row) => ({ date: row.date, count: row.count })),
    classPerformance: classPerfResult.rows.map((row) => ({
      classId: row.class_id,
      classSlug: row.class_slug,
      classTitle: row.class_title,
      courseTitle: row.course_title,
      attempts: row.attempts,
      passRate: row.pass_rate,
      avgScore: row.avg_score,
    })),
    recentSubmissions: recentResult.rows.map((row) => ({
      attemptId: row.attempt_id,
      githubUsername: row.github_username,
      courseTitle: row.course_title,
      classTitle: row.class_title,
      status: row.status,
      grade: row.weighted_score != null ? scoreToGrade(row.weighted_score) : null,
      weightedScore: row.weighted_score,
      createdAt: new Date(row.created_at).toISOString(),
    })),
  };
}
