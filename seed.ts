import { and, eq, sql } from "drizzle-orm";
import { db } from "./lib/db/client";
import { classes, assignmentVersions } from "./lib/db/schema";
import { createCourse, createClass, createAssignmentVersionAndActivate, getCourseBySlug } from "./lib/db/queries";

const EVEN_RUBRIC = { completeness: 20, correctness: 20, quality: 20, novelty: 20, understanding: 20 };

interface SeedAssignment {
  title: string;
  objective: string;
  expectedDeliverables: string[];
  expectedForkOf?: string;
}

/** Original single-course curriculum, formerly config/assignments.ts — this data now lives here. */
const assignments: Record<string, SeedAssignment> = {
  "class-01": {
    title: "Set Up Your Agent Engineering Workspace",
    objective:
      "Fork the course repository (sensei-ji/agent_engineering), clone it locally, open it in the Antigravity IDE, and create a Class 1 workspace documenting that the setup was completed.",
    expectedDeliverables: [
      "A README.md at my-work/class-01/README.md (this exact path/casing)",
      "The README states the student's full name",
      "The README states the student's GitHub username",
      "The setup checklist in the README (forked, cloned, opened in Antigravity, created the directory, created the README, committed, pushed) is fully checked off, not left blank",
      "A substantive 'What I Learned' reflection paragraph about Git/GitHub/Antigravity setup — not a placeholder or single generic sentence",
      "A substantive 'Challenges' section describing an actual problem encountered and how it was resolved — not left as a placeholder",
    ],
    expectedForkOf: "sensei-ji/agent_engineering",
  },
  "class-02": {
    title: "Data Structures Fundamentals",
    objective: "Implement and use core data structures (arrays, linked lists, stacks, queues) to solve a small problem.",
    expectedDeliverables: [
      "Working implementation of at least two data structures",
      "Unit tests or example usage demonstrating correctness",
      "Time/space complexity discussed in comments or README",
    ],
  },
  "class-03": {
    title: "Build the WidgetWare SDR Context Package",
    objective:
      "Convert the WidgetWare SDR business concepts into a structured, testable context package a future agent can consume — without building the ADK agent yet. The package must keep five context layers separate (system instructions, business context, task context, retrieved evidence, workflow state) and be verified against four required scenarios: a qualified account, an unqualified account, insufficient evidence, and a prompt-injection attempt. Full spec: my-work/class-03/SPEC.md.",
    expectedDeliverables: [
      "config/products.yaml, config/icp.yaml, config/policies.yaml — at least two WidgetWare offerings with target buyers and approved claims; ICP fit dimensions (company size, preferred/excluded industries, regions, buying signals, required fields); and policies defining the five evidence classifications (verified_fact, derived_fact, inference, unknown, conflict), prohibited actions, and human-approval requirements",
      "src/widgetware_sdr/instructions.py exposing get_system_instructions() — inspectable, observable instructions (not vague guidance) covering role, objective, allowed information, evidence classification, uncertainty handling, prohibited actions, stop conditions, and escalation",
      "src/widgetware_sdr/context_builder.py exposing build_context(account, objective, evidence, state=None), returning five separate keys (system_instructions, business_context, task_context, retrieved_evidence, state) without mutating inputs, calling an LLM, or making network calls",
      "Evidence records that preserve provenance (claim, classification, source, retrieved_at, excerpt); account notes and other task data are treated as untrusted and can never override instructions or policy",
      "Four required scenario fixtures (qualified account, unqualified account, insufficient evidence, prompt injection attempt) with automated tests covering config, instructions, the context builder, and all four scenarios — all tests passing",
      "No ADK agent, no LLM/Gemini calls, no web search, no email/CRM/social actions, no database persistence, and no deployment code — Class 3 is context only",
    ],
  },
  "class-04": {
    title: "Object-Oriented Design",
    objective: "Model a real-world domain using classes, inheritance, and encapsulation.",
    expectedDeliverables: [
      "A class hierarchy with meaningful inheritance or composition",
      "Encapsulated state with clear public interfaces",
      "A short write-up or diagram explaining the design",
    ],
  },
  "class-05": {
    title: "APIs & Web Requests",
    objective: "Build a small application that consumes a public API and processes the response.",
    expectedDeliverables: [
      "Working HTTP client code against a real or mocked API",
      "Error handling for network/API failures",
      "Basic parsing/transformation of the response data",
    ],
  },
  "class-06": {
    title: "Databases & Persistence",
    objective: "Design a simple schema and implement CRUD operations against a database or persistent store.",
    expectedDeliverables: [
      "A schema definition (SQL, ORM models, or equivalent)",
      "Create/Read/Update/Delete operations implemented and demonstrated",
      "Basic input validation before persistence",
    ],
  },
  "class-07": {
    title: "Testing & Debugging",
    objective: "Write a meaningful automated test suite for prior or new functionality and demonstrate debugging practices.",
    expectedDeliverables: [
      "Unit tests covering at least the core logic paths, including an edge case",
      "Tests are runnable via a single documented command",
      "Evidence of debugging (e.g., logging, assertions, or a written postmortem)",
    ],
  },
  "class-08": {
    title: "Concurrency & Asynchronous Programming",
    objective: "Demonstrate correct use of asynchronous or concurrent programming to solve a problem more efficiently.",
    expectedDeliverables: [
      "Working async/concurrent implementation (threads, async/await, workers, etc.)",
      "Handling of race conditions or shared-state safety where applicable",
      "A comparison against a naive synchronous approach",
    ],
  },
  "class-09": {
    title: "System Design Mini-Project",
    objective: "Design and partially implement a small multi-component system (e.g., client + server, or producer + consumer).",
    expectedDeliverables: [
      "A clear architecture diagram or written design",
      "At least two components implemented and integrated",
      "Discussion of trade-offs made in the design",
    ],
  },
  "class-10": {
    title: "Capstone Project",
    objective: "Bring together concepts from the course into a cohesive final project of the student's choosing.",
    expectedDeliverables: [
      "A complete, runnable project with setup instructions",
      "A README explaining the problem, approach, and how to run it",
      "Evidence of applying at least three concepts from earlier classes",
    ],
  },
};

const ALL_CLASS_IDS = Array.from({ length: 10 }, (_, i) => `class-${String(i + 1).padStart(2, "0")}`);

async function main() {
  let course = await getCourseBySlug("agent-engineering");
  if (!course) {
    course = await createCourse({
      slug: "agent-engineering",
      title: "Agent Engineering",
      description: "Seeded from the original single-course config/assignments.ts.",
      status: "published",
    });
    console.log(`Created course "agent-engineering" (${course.id})`);
  } else {
    console.log(`Course "agent-engineering" already exists (${course.id})`);
  }

  for (const [index, classId] of ALL_CLASS_IDS.entries()) {
    const assignment = assignments[classId];
    if (!assignment) continue;

    let [classRow] = await db
      .select()
      .from(classes)
      .where(and(eq(classes.courseId, course.id), eq(classes.slug, classId)))
      .limit(1);

    if (!classRow) {
      classRow = await createClass({
        courseId: course.id,
        slug: classId,
        title: classId,
        orderIndex: index,
        status: "published",
        expectedForkOf: assignment.expectedForkOf,
      });
      console.log(`  Created class ${classId}`);
    } else if (classRow.title !== classId) {
      [classRow] = await db.update(classes).set({ title: classId, updatedAt: new Date() }).where(eq(classes.id, classRow.id)).returning();
      console.log(`  Updated class ${classId} title to "${classId}"`);
    } else {
      console.log(`  Class ${classId} already exists`);
    }

    const [latestVersion] = await db
      .select()
      .from(assignmentVersions)
      .where(eq(assignmentVersions.classId, classRow.id))
      .orderBy(sql`${assignmentVersions.versionNumber} desc`)
      .limit(1);

    if (!latestVersion) {
      await createAssignmentVersionAndActivate({
        classId: classRow.id,
        versionNumber: 1,
        title: assignment.title,
        objective: assignment.objective,
        expectedDeliverables: assignment.expectedDeliverables,
        expectedForkOf: assignment.expectedForkOf,
        rubricWeights: EVEN_RUBRIC,
      });
      console.log(`  Created + activated v1 for ${classId}`);
    } else if (!classRow.currentAssignmentVersionId) {
      await db.update(classes).set({ currentAssignmentVersionId: latestVersion.id }).where(eq(classes.id, classRow.id));
      console.log(`  Re-activated existing v${latestVersion.versionNumber} for ${classId}`);
    } else {
      // Intentionally a no-op once a version exists and is active, even if `assignments` above
      // has since been edited — this script is a one-time bootstrap, not a sync job. Content
      // changes after the first seed go through the admin "edit assignment" flow (which is what
      // publishes a new version and reactivates it), not another run of this script.
      console.log(`  v${latestVersion.versionNumber} already exists for ${classId}`);
    }
  }

  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
