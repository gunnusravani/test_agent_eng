import { NextResponse } from "next/server";
import { getPublishedCourses } from "@/lib/db/queries";
import type { CourseDto } from "@/types/schemas";

export async function GET() {
  const courses = await getPublishedCourses();
  const body: CourseDto[] = courses.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description,
  }));
  return NextResponse.json(body);
}
