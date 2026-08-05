import { NextResponse } from "next/server";
import { GitHubError } from "@/lib/errors";
import { evaluateAssignment, MODEL_NAME } from "@/lib/evaluator";
import { fetchRepository, findMyWorkPath, findReadme, getRepoTree, hasClassDirectory, parseGitHubUrl, resolveBranchSha } from "@/lib/github";
import { gatherClassFiles } from "@/lib/parser";
import { scoreToGrade, weightedAverage } from "@/lib/grades";
import { PROMPT_VERSION } from "@/lib/prompts";
import { evaluateClass02Assignment, isMultiProjectClass } from "@/lib/graders/class-02";
import {
  findExistingAttempt,
  getAttemptHistoryForStudent,
  getClassForEvaluation,
  getOrCreateStudent,
  getResultsForStudent,
  insertAttempt,
} from "@/lib/db/queries";
import type { Attempt } from "@/lib/db/schema";
import {
  evaluateRequestSchema,
  type AssignmentEvaluationResult,
  type ForkCheck,
  type MultiProjectEvaluationResult,
  type ValidationResult,
} from "@/types/schemas";
import type { AssignmentConfig } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Reconstructs the API response shape for a resubmission that matched an existing attempt
 * exactly (same commit, class, assignment version, prompt version, model — see
 * findExistingAttempt). The LLM's own raw overallGrade isn't persisted on attempts (the app
 * always derives the canonical grade from weightedScore, see lib/grades.ts), so it's
 * recomputed the same way here; nothing downstream reads this field directly.
 */
function attemptToEvaluationResult(attempt: Attempt, classSlug: string): AssignmentEvaluationResult {
  if (attempt.status === "error") {
    return { status: "error", classId: classSlug, message: attempt.errorMessage ?? "Unknown error" };
  }
  return {
    status: "success",
    classId: classSlug,
    data: {
      scores: {
        completeness: attempt.completeness!,
        correctness: attempt.correctness!,
        quality: attempt.quality!,
        novelty: attempt.novelty!,
        understanding: attempt.understanding!,
      },
      overallGrade: scoreToGrade(attempt.weightedScore ?? 0),
      confidence: attempt.confidence!,
      feedback: attempt.feedbackJson!,
    },
    evaluatedAt: attempt.createdAt.toISOString(),
    modelUsed: attempt.modelName,
  };
}

/** Same idea as attemptToEvaluationResult, for classes graded by a specialized multi-part grader. */
function attemptToMultiProjectResult(attempt: Attempt, classSlug: string): MultiProjectEvaluationResult {
  if (attempt.status === "error") {
    return { status: "error", classId: classSlug, message: attempt.errorMessage ?? "Unknown error" };
  }
  return {
    status: "success",
    classId: classSlug,
    data: attempt.structuredResult!,
    evaluatedAt: attempt.createdAt.toISOString(),
    modelUsed: attempt.modelName,
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = evaluateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const { courseSlug, classSlug, repoUrl } = parsed.data;
  const isMultiProject = isMultiProjectClass(classSlug);

  const lookup = await getClassForEvaluation(courseSlug, classSlug);
  if (!lookup) {
    return NextResponse.json({ error: "This course or class is not available." }, { status: 404 });
  }
  const { classRow, assignmentVersion } = lookup;

  const parsedUrl = parseGitHubUrl(repoUrl);
  if (!parsedUrl) {
    return NextResponse.json({ error: "Must be a github.com repository URL, e.g. https://github.com/owner/repo" }, { status: 400 });
  }

  try {
    const { owner, repo } = parsedUrl;
    const repoMetadata = await fetchRepository(owner, repo);
    const commitSha = await resolveBranchSha(owner, repo, repoMetadata.defaultBranch);
    const tree = await getRepoTree(owner, repo, commitSha);

    const hasReadme = findReadme(tree);
    const myWorkPath = findMyWorkPath(tree);
    const hasMyWork = Boolean(myWorkPath);
    const hasClassFolder = myWorkPath ? hasClassDirectory(tree, myWorkPath, classSlug) : false;

    const errors: string[] = [];
    if (!hasMyWork) errors.push("Missing my-work directory.");
    if (hasMyWork && !hasClassFolder) errors.push(`Missing class folder: my-work/${classSlug}.`);
    // No further class-02-specific structural gate here on purpose: which of the four
    // agy2-pprojects folders exist is graded per-project inside evaluateClass02Assignment
    // (a missing project scores near-zero on its own, it doesn't fail the whole submission).

    const forkCheck: ForkCheck | null = classRow.expectedForkOf
      ? {
          expectedUpstream: classRow.expectedForkOf,
          actualUpstream: repoMetadata.parentFullName,
          ok: repoMetadata.isFork && repoMetadata.parentFullName?.toLowerCase() === classRow.expectedForkOf.toLowerCase(),
        }
      : null;

    const validation: ValidationResult = {
      valid: hasMyWork && hasClassFolder,
      owner,
      repo,
      htmlUrl: repoMetadata.htmlUrl,
      hasReadme,
      hasMyWork,
      hasClassFolder,
      isFork: repoMetadata.isFork,
      parentFullName: repoMetadata.parentFullName,
      forkCheck,
      errors,
    };

    if (!validation.valid) {
      return NextResponse.json({ validation });
    }

    const student = await getOrCreateStudent(owner);

    const existingAttempt = await findExistingAttempt({
      studentId: student.id,
      classId: classRow.id,
      commitSha,
      assignmentVersionId: assignmentVersion.id,
      promptVersion: PROMPT_VERSION,
      modelName: MODEL_NAME,
    });

    if (existingAttempt) {
      const resultsTable = await getResultsForStudent(owner, courseSlug);
      const attemptHistory = await getAttemptHistoryForStudent(owner, courseSlug);
      return NextResponse.json({
        validation,
        ...(isMultiProject
          ? { multiProjectResult: attemptToMultiProjectResult(existingAttempt, classSlug) }
          : { evaluation: attemptToEvaluationResult(existingAttempt, classSlug) }),
        weightedScore: existingAttempt.weightedScore,
        resultsTable,
        attemptHistory,
        cached: true,
      });
    }

    const assignmentConfig: AssignmentConfig = {
      title: assignmentVersion.title,
      objective: assignmentVersion.objective,
      expectedDeliverables: assignmentVersion.expectedDeliverables,
      expectedForkOf: classRow.expectedForkOf ?? undefined,
    };

    if (isMultiProject) {
      const evaluation = await evaluateClass02Assignment({ assignment: assignmentConfig, owner, repo, tree, myWorkPath: myWorkPath! });
      const weightedScore = evaluation.status === "success" ? Math.min(evaluation.data.overallScore, 100) / 10 : null;

      await insertAttempt({
        studentId: student.id,
        classId: classRow.id,
        assignmentVersionId: assignmentVersion.id,
        repoUrl,
        commitSha,
        status: evaluation.status,
        weightedScore,
        confidence: null,
        structuredResult: evaluation.status === "success" ? evaluation.data : undefined,
        errorMessage: evaluation.status === "error" ? evaluation.message : null,
        promptVersion: PROMPT_VERSION,
        modelName: MODEL_NAME,
      });

      const resultsTable = await getResultsForStudent(owner, courseSlug);
      const attemptHistory = await getAttemptHistoryForStudent(owner, courseSlug);

      return NextResponse.json({ validation, multiProjectResult: evaluation, weightedScore, resultsTable, attemptHistory });
    }

    const gathered = await gatherClassFiles({ owner, repo, tree, classId: classSlug, myWorkPath: myWorkPath! });
    const evaluation = await evaluateAssignment({ assignment: assignmentConfig, gathered });
    const weightedScore = evaluation.status === "success" ? weightedAverage(evaluation.data.scores, assignmentVersion.rubricWeights) : null;

    await insertAttempt({
      studentId: student.id,
      classId: classRow.id,
      assignmentVersionId: assignmentVersion.id,
      repoUrl,
      commitSha,
      status: evaluation.status,
      completeness: evaluation.status === "success" ? evaluation.data.scores.completeness : null,
      correctness: evaluation.status === "success" ? evaluation.data.scores.correctness : null,
      quality: evaluation.status === "success" ? evaluation.data.scores.quality : null,
      novelty: evaluation.status === "success" ? evaluation.data.scores.novelty : null,
      understanding: evaluation.status === "success" ? evaluation.data.scores.understanding : null,
      weightedScore,
      confidence: evaluation.status === "success" ? evaluation.data.confidence : null,
      feedbackJson: evaluation.status === "success" ? evaluation.data.feedback : undefined,
      errorMessage: evaluation.status === "error" ? evaluation.message : null,
      promptVersion: PROMPT_VERSION,
      modelName: MODEL_NAME,
    });

    const resultsTable = await getResultsForStudent(owner, courseSlug);
    const attemptHistory = await getAttemptHistoryForStudent(owner, courseSlug);

    return NextResponse.json({
      validation,
      evaluation,
      weightedScore,
      files: { filesIncluded: gathered.filesIncluded, filesOmitted: gathered.filesOmitted },
      resultsTable,
      attemptHistory,
    });
  } catch (error) {
    if (error instanceof GitHubError) {
      const status = error.code === "RATE_LIMITED" ? 429 : error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("[api/evaluate] Unexpected error:", error);
    return NextResponse.json({ error: "An unexpected error occurred while evaluating the repository." }, { status: 500 });
  }
}
