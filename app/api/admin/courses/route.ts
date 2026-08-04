import { NextResponse } from "next/server";
import { isUniqueViolation } from "@/lib/errors";
import { createCourse, insertAuditLog, listCoursesAdmin } from "@/lib/db/queries";
import { adminCreateCourseSchema } from "@/types/schemas";

export async function GET() {
  const courses = await listCoursesAdmin();
  return NextResponse.json(courses);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = adminCreateCourseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  try {
    const course = await createCourse(parsed.data);
    await insertAuditLog({ action: "create", entityType: "course", entityId: course.id, details: parsed.data });
    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "A course with this slug already exists." }, { status: 409 });
    }
    console.error("[api/admin/courses] Unexpected error:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
