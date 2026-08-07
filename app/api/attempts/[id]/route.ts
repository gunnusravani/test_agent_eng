import { NextResponse } from "next/server";
import { getAttemptById } from "@/lib/db/queries";
import { isMultiProjectClass } from "@/lib/graders/class-02";
import { isClass03 } from "@/lib/graders/class-03";
import { attemptToClass03Result, attemptToEvaluationResult, attemptToMultiProjectResult } from "@/lib/attempt-transform";
import type { AttemptDetailResponse } from "@/types/schemas";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getAttemptById(id);
  if (!detail) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }

  const { attempt, classSlug, classTitle } = detail;
  const isMultiProject = isMultiProjectClass(classSlug);
  const isClass03Grade = isClass03(classSlug);

  const response: AttemptDetailResponse = {
    attemptId: attempt.id,
    classSlug,
    classTitle,
    repoUrl: attempt.repoUrl,
    commitSha: attempt.commitSha,
    createdAt: attempt.createdAt.toISOString(),
    weightedScore: attempt.weightedScore,
    ...(isMultiProject
      ? { multiProjectResult: attemptToMultiProjectResult(attempt, classSlug) }
      : isClass03Grade
        ? { class03Result: attemptToClass03Result(attempt, classSlug) }
        : { evaluation: attemptToEvaluationResult(attempt, classSlug) }),
  };

  return NextResponse.json(response);
}
