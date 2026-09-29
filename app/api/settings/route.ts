export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getShortlistSize } from "@/lib/ranking";
import { regenerateDraftsForRole } from "@/lib/drafts";

export async function GET() {
  const shortlistSize = await getShortlistSize();
  return NextResponse.json({ shortlistSize });
}

export async function POST(req: NextRequest) {
  const { shortlistSize } = (await req.json()) as { shortlistSize?: number };
  if (!Number.isInteger(shortlistSize) || (shortlistSize as number) <= 0) {
    return NextResponse.json({ error: "shortlistSize must be a positive integer" }, { status: 400 });
  }

  await sql`
    INSERT INTO settings (key, value) VALUES ('shortlist_size', ${String(shortlistSize)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;

  await regenerateDraftsForRole("PM");
  await regenerateDraftsForRole("SPM");

  return NextResponse.json({ shortlistSize });
}
