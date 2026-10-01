export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { setDecision } from "@/lib/decisions";
import type { Decision } from "@/lib/types";

/**
 * Sets a candidate's shortlist decision. "advance"/"reject" each send the
 * matching email immediately — one click is the whole action, matching the
 * reference design. "pending" ("Back to pending" / "Undo") only resets the
 * decision; it never recalls an email that already sent.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { decision, note } = (await req.json()) as { decision?: Decision; note?: string };

    if (decision !== "advance" && decision !== "reject" && decision !== "pending") {
      return NextResponse.json({ error: "decision must be advance, reject, or pending" }, { status: 400 });
    }

    const result = await setDecision(id, decision, note);
    return NextResponse.json({ ok: true, sendError: result.sendError });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
