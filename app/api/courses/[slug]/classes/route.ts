import { NextResponse } from "next/server";
import { getPublishedClassesByCourseSlug } from "@/lib/db/queries";
import type { ClassSummaryDto } from "@/types/schemas";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rows = await getPublishedClassesByCourseSlug(slug);
  if (!rows) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }
  const body: ClassSummaryDto[] = rows;
  return NextResponse.json(body);
}
