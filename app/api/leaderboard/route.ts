import { NextResponse } from "next/server";
import { getClassLeaderboard } from "@/lib/db/queries";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const courseSlug = searchParams.get("courseSlug");
  if (!courseSlug) {
    return NextResponse.json({ error: "courseSlug is required" }, { status: 400 });
  }

  const leaderboard = await getClassLeaderboard(courseSlug);
  return NextResponse.json({ leaderboard });
}
