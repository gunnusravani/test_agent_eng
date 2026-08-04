import { NextResponse } from "next/server";
import { createAssignmentVersionAndActivate, getClassById, getNextVersionNumber, insertAuditLog } from "@/lib/db/queries";
import { adminCreateAssignmentVersionSchema } from "@/types/schemas";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = adminCreateAssignmentVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const classRow = await getClassById(parsed.data.classId);
  if (!classRow) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }

  const versionNumber = await getNextVersionNumber(parsed.data.classId);
  const version = await createAssignmentVersionAndActivate({ ...parsed.data, versionNumber });
  await insertAuditLog({
    action: "publish",
    entityType: "assignment_version",
    entityId: version.id,
    details: { classId: parsed.data.classId, versionNumber },
  });

  return NextResponse.json(version, { status: 201 });
}
