export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runScoringPipeline } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  try {
    const { candidateId } = (await req.json()) as { candidateId?: string };
    if (!candidateId) {
      return NextResponse.json({ error: "Missing candidateId" }, { status: 400 });
    }

    try {
      await runScoringPipeline(candidateId);
      return NextResponse.json({ status: "scored" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ status: "error", error: message }, { status: 200 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", error: message }, { status: 400 });
  }
}
