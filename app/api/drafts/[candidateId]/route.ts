export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/** Saves a manual edit to the draft body. Refuses to edit an already-sent draft. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const { editedBody } = (await req.json()) as { editedBody?: string };
  if (typeof editedBody !== "string") {
    return NextResponse.json({ error: "editedBody is required" }, { status: 400 });
  }

  const rows = (await sql`SELECT status FROM email_drafts WHERE candidate_id = ${candidateId}`) as {
    status: string;
  }[];
  if (rows.length === 0) return NextResponse.json({ error: "No draft found" }, { status: 404 });
  if (rows[0].status === "sent") {
    return NextResponse.json({ error: "Cannot edit a draft that has already been sent" }, { status: 409 });
  }

  await sql`
    UPDATE email_drafts SET edited_body = ${editedBody}, updated_at = now() WHERE candidate_id = ${candidateId}
  `;
  return NextResponse.json({ ok: true });
}
