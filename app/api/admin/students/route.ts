import { NextResponse } from "next/server";
import { listStudentClassSummaries } from "@/lib/db/queries";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const courseId = searchParams.get("courseId") ?? undefined;
  const classId = searchParams.get("classId") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20") || 20));

  const result = await listStudentClassSummaries({ search, courseId, classId, page, pageSize });
  return NextResponse.json({ ...result, page, pageSize });
}
