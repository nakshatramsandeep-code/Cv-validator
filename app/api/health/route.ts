export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { assertRubricWeightsValid } from "@/lib/db";

export async function GET() {
  try {
    await assertRubricWeightsValid();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
