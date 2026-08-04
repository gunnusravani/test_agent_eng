import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  doublePrecision,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";

export const contentStatusEnum = pgEnum("content_status", ["draft", "published", "archived"]);
export const attemptStatusEnum = pgEnum("attempt_status", ["success", "error"]);
export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "archive",
  "unarchive",
  "publish",
  "unpublish",
  "rubric_update",
]);
export const auditEntityEnum = pgEnum("audit_entity", ["course", "class", "assignment_version"]);

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  status: contentStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const classes = pgTable(
  "classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    orderIndex: integer("order_index").notNull(),
    status: contentStatusEnum("status").notNull().default("draft"),
    /** Canonical fork-check value, used for live validation on every /api/evaluate call. */
    expectedForkOf: text("expected_fork_of"),
    /**
     * No FK constraint on purpose: this points at a row in assignment_versions,
     * which itself FKs back to this table's id. A real FK here would create a
     * circular dependency between the two tables at migration time. Enforced
     * and kept in sync at the app layer (see createAssignmentVersionAndActivate
     * in lib/db/queries.ts), which is the only place that writes it.
     */
    currentAssignmentVersionId: uuid("current_assignment_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [unique("classes_course_id_slug_unique").on(t.courseId, t.slug)],
);

export const assignmentVersions = pgTable(
  "assignment_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    title: text("title").notNull(),
    objective: text("objective").notNull(),
    expectedDeliverables: text("expected_deliverables").array().notNull(),
    /** Historical snapshot of classes.expectedForkOf at the time this version was created. */
    expectedForkOf: text("expected_fork_of"),
    /** 0-100 integer weights over the fixed scoring dimensions; must sum to 100 (enforced at write time). */
    rubricWeights: jsonb("rubric_weights").notNull().$type<{
      completeness: number;
      correctness: number;
      quality: number;
      novelty: number;
      understanding: number;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("assignment_versions_class_id_version_number_unique").on(t.classId, t.versionNumber),
    index("assignment_versions_class_id_idx").on(t.classId),
  ],
);

export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    githubUsername: text("github_username").notNull(),
    githubUsernameLower: text("github_username_lower")
      .notNull()
      .generatedAlwaysAs(sql`lower(github_username)`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("students_github_username_lower_unique").on(t.githubUsernameLower)],
);

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    assignmentVersionId: uuid("assignment_version_id")
      .notNull()
      .references(() => assignmentVersions.id),
    repoUrl: text("repo_url").notNull(),
    commitSha: text("commit_sha").notNull(),
    status: attemptStatusEnum("status").notNull(),
    completeness: doublePrecision("completeness"),
    correctness: doublePrecision("correctness"),
    quality: doublePrecision("quality"),
    novelty: doublePrecision("novelty"),
    understanding: doublePrecision("understanding"),
    weightedScore: doublePrecision("weighted_score"),
    confidence: doublePrecision("confidence"),
    feedbackJson: jsonb("feedback_json").$type<{
      summary: string;
      strengths: string[];
      weaknesses: string[];
      missingFeatures: string[];
      recommendations: string[];
    }>(),
    errorMessage: text("error_message"),
    promptVersion: text("prompt_version").notNull(),
    modelName: text("model_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attempts_student_id_class_id_idx").on(t.studentId, t.classId),
    index("attempts_class_id_idx").on(t.classId),
    index("attempts_created_at_idx").on(t.createdAt),
    index("attempts_assignment_version_id_idx").on(t.assignmentVersionId),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor: text("actor").notNull().default("admin"),
    action: auditActionEnum("action").notNull(),
    entityType: auditEntityEnum("entity_type").notNull(),
    entityId: uuid("entity_id"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;
export type AssignmentVersion = typeof assignmentVersions.$inferSelect;
export type NewAssignmentVersion = typeof assignmentVersions.$inferInsert;
export type Student = typeof students.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type NewAttempt = typeof attempts.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
