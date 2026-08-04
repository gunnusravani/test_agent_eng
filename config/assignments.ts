import type { AssignmentConfig } from "@/types";

/**
 * Per-class assignment specs used to build the LLM evaluation prompt.
 * Edit this file to match your actual curriculum before evaluating real
 * submissions — these are generic placeholders, not a real syllabus.
 */
export const assignments: Record<string, AssignmentConfig> = {
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
    title: "Algorithms: Sorting & Searching",
    objective: "Implement classic sorting and searching algorithms and compare their performance.",
    expectedDeliverables: [
      "At least two sorting algorithms implemented from scratch",
      "A binary search or equivalent search implementation",
      "Basic benchmarking or Big-O analysis of the implementations",
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

export function getAssignment(classId: string): AssignmentConfig | undefined {
  return assignments[classId];
}

export const ALL_CLASS_IDS = Array.from({ length: 10 }, (_, i) => `class-${String(i + 1).padStart(2, "0")}`);
