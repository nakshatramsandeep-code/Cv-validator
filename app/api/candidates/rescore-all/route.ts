export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * Returns every candidate id with parsed CV content, for the client to drive
 * through POST /api/candidates/[id]/rescore with limited concurrency — the
 * same pattern as upload, so no single request risks a Vercel timeout.
 */
export async function GET() {
  const rows = (await sql`
    SELECT id FROM candidates WHERE cv_content IS NOT NULL ORDER BY created_at ASC
  `) as { id: string }[];
  return NextResponse.json({ candidateIds: rows.map((r) => r.id) });
}
