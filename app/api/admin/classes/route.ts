import { NextResponse } from "next/server";
import { isUniqueViolation } from "@/lib/errors";
import { createClass, getCourseById, insertAuditLog, listClassesAdmin } from "@/lib/db/queries";
import { adminCreateClassSchema } from "@/types/schemas";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get("courseId");
  if (!courseId) {
    return NextResponse.json({ error: "courseId is required." }, { status: 400 });
  }
  const classes = await listClassesAdmin(courseId);
  return NextResponse.json(classes);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = adminCreateClassSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const course = await getCourseById(parsed.data.courseId);
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  try {
    const classRow = await createClass(parsed.data);
    await insertAuditLog({ action: "create", entityType: "class", entityId: classRow.id, details: parsed.data });
    return NextResponse.json(classRow, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "A class with this slug already exists in this course." }, { status: 409 });
    }
    console.error("[api/admin/classes] Unexpected error:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
