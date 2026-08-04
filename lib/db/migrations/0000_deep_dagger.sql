CREATE TYPE "public"."attempt_status" AS ENUM('success', 'error');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'archive', 'unarchive', 'publish', 'unpublish', 'rubric_update');--> statement-breakpoint
CREATE TYPE "public"."audit_entity" AS ENUM('course', 'class', 'assignment_version');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "assignment_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"title" text NOT NULL,
	"objective" text NOT NULL,
	"expected_deliverables" text[] NOT NULL,
	"expected_fork_of" text,
	"rubric_weights" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_versions_class_id_version_number_unique" UNIQUE("class_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"assignment_version_id" uuid NOT NULL,
	"repo_url" text NOT NULL,
	"commit_sha" text NOT NULL,
	"status" "attempt_status" NOT NULL,
	"completeness" double precision,
	"correctness" double precision,
	"quality" double precision,
	"novelty" double precision,
	"understanding" double precision,
	"weighted_score" double precision,
	"confidence" double precision,
	"feedback_json" jsonb,
	"error_message" text,
	"prompt_version" text NOT NULL,
	"model_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text DEFAULT 'admin' NOT NULL,
	"action" "audit_action" NOT NULL,
	"entity_type" "audit_entity" NOT NULL,
	"entity_id" uuid,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"order_index" integer NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"expected_fork_of" text,
	"current_assignment_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_course_id_slug_unique" UNIQUE("course_id","slug")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_username" text NOT NULL,
	"github_username_lower" text GENERATED ALWAYS AS (lower(github_username)) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_github_username_lower_unique" UNIQUE("github_username_lower")
);
--> statement-breakpoint
ALTER TABLE "assignment_versions" ADD CONSTRAINT "assignment_versions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_assignment_version_id_assignment_versions_id_fk" FOREIGN KEY ("assignment_version_id") REFERENCES "public"."assignment_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_versions_class_id_idx" ON "assignment_versions" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "attempts_student_id_class_id_idx" ON "attempts" USING btree ("student_id","class_id");--> statement-breakpoint
CREATE INDEX "attempts_class_id_idx" ON "attempts" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "attempts_created_at_idx" ON "attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "attempts_assignment_version_id_idx" ON "attempts" USING btree ("assignment_version_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");