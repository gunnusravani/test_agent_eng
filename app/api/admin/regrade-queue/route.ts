import { NextResponse } from "next/server";
import { getRegradeQueue } from "@/lib/db/queries";

export async function GET() {
  const items = await getRegradeQueue();
  return NextResponse.json({ items });
}
