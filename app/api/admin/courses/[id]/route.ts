import { NextResponse } from "next/server";
import { isUniqueViolation } from "@/lib/errors";
import { archiveCourse, getCourseById, insertAuditLog, updateCourse } from "@/lib/db/queries";
import { adminUpdateCourseSchema } from "@/types/schemas";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = adminUpdateCourseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const existing = await getCourseById(id);
  if (!existing) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  try {
    const course = await updateCourse(id, parsed.data);
    await insertAuditLog({ action: "update", entityType: "course", entityId: id, details: parsed.data });
    return NextResponse.json(course);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "A course with this slug already exists." }, { status: 409 });
    }
    console.error("[api/admin/courses/:id] Unexpected error:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const existing = await getCourseById(id);
  if (!existing) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const course = await archiveCourse(id);
  await insertAuditLog({ action: "archive", entityType: "course", entityId: id });
  return NextResponse.json(course);
}
