import { NextResponse } from "next/server";
import { createAssignmentVersionAndActivate, getAssignmentVersion, getNextVersionNumber, insertAuditLog } from "@/lib/db/queries";
import { adminEditAssignmentVersionSchema } from "@/types/schemas";

/**
 * "Editing" an assignment version never mutates the historical row at :id — it creates a new
 * version (versionNumber + 1) for the same class and repoints the class's active version at it,
 * per the mandatory versioning requirement (historical grading criteria are immutable).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = adminEditAssignmentVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const previousVersion = await getAssignmentVersion(id);
  if (!previousVersion) {
    return NextResponse.json({ error: "Assignment version not found." }, { status: 404 });
  }

  const versionNumber = await getNextVersionNumber(previousVersion.classId);
  const version = await createAssignmentVersionAndActivate({
    ...parsed.data,
    classId: previousVersion.classId,
    versionNumber,
  });
  await insertAuditLog({
    action: "rubric_update",
    entityType: "assignment_version",
    entityId: version.id,
    details: { classId: previousVersion.classId, previousVersionId: id, versionNumber },
  });

  return NextResponse.json(version, { status: 201 });
}
