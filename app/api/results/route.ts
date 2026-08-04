import { NextResponse } from "next/server";
import { getAttemptHistoryForStudent, getResultsForStudent } from "@/lib/db/queries";
import { resultsQuerySchema } from "@/types/schemas";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = resultsQuerySchema.safeParse({
    githubUsername: searchParams.get("githubUsername") ?? undefined,
    courseSlug: searchParams.get("courseSlug") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const resultsTable = await getResultsForStudent(parsed.data.githubUsername, parsed.data.courseSlug);
  const attemptHistory = await getAttemptHistoryForStudent(parsed.data.githubUsername, parsed.data.courseSlug);
  return NextResponse.json({ resultsTable, attemptHistory });
}
