import { and, eq, sql } from "drizzle-orm";
import { scoreToGrade } from "@/lib/grades";
import type { AttemptHistoryRow, ResultsRow } from "@/types/schemas";
import { db } from "./client";
import {
  courses,
  classes,
  assignmentVersions,
  students,
  attempts,
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
    createdAt: row.createdAt.toISOString(),
  }));
}
