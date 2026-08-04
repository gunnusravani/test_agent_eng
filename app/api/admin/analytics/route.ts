import { NextResponse } from "next/server";
import { getDashboardAnalytics } from "@/lib/db/queries";

export async function GET() {
  const analytics = await getDashboardAnalytics();
  return NextResponse.json(analytics);
}
