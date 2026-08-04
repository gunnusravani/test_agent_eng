import { NextResponse } from "next/server";
import { getAttemptHistoryForStudent, getResultsForStudent, getStudentByUsername } from "@/lib/db/queries";

export async function GET(_request: Request, { params }: { params: Promise<{ githubUsername: string }> }) {
  const { githubUsername } = await params;

  const student = await getStudentByUsername(githubUsername);
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const [resultsTable, attemptHistory] = await Promise.all([
    getResultsForStudent(githubUsername),
    getAttemptHistoryForStudent(githubUsername),
  ]);

  return NextResponse.json({ student, resultsTable, attemptHistory });
}
