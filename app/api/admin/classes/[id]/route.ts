import { NextResponse } from "next/server";
import { isUniqueViolation } from "@/lib/errors";
import { archiveClass, getClassById, insertAuditLog, listAssignmentVersions, updateClass } from "@/lib/db/queries";
import { adminUpdateClassSchema } from "@/types/schemas";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const classRow = await getClassById(id);
  if (!classRow) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }

  const versions = await listAssignmentVersions(id);
  return NextResponse.json({ classRow, versions });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = adminUpdateClassSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const existing = await getClassById(id);
  if (!existing) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }

  try {
    const classRow = await updateClass(id, parsed.data);
    await insertAuditLog({ action: "update", entityType: "class", entityId: id, details: parsed.data });
    return NextResponse.json(classRow);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "A class with this slug already exists in this course." }, { status: 409 });
    }
    console.error("[api/admin/classes/:id] Unexpected error:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const existing = await getClassById(id);
  if (!existing) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }

  const classRow = await archiveClass(id);
  await insertAuditLog({ action: "archive", entityType: "class", entityId: id });
  return NextResponse.json(classRow);
}
