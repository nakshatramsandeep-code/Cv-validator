export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { runScoringPipeline } from "@/lib/pipeline";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await runScoringPipeline(id);
    return NextResponse.json({ status: "scored" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", error: message }, { status: 200 });
  }
}
