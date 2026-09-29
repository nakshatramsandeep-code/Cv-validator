export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateEmailDraft } from "@/lib/ai";
import { jobDescriptionFor } from "@/lib/job-descriptions";
import type { EmailType, Role } from "@/lib/types";

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

/** Arjun manually overrides invite/rejection for one candidate, regenerating the draft to that type. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const { type } = (await req.json()) as { type?: EmailType };
  if (type !== "invite" && type !== "rejection") {
    return NextResponse.json({ error: "type must be invite or rejection" }, { status: 400 });
  }

  const rows = (await sql`
    SELECT c.applied_role, c.cv_content, d.status
    FROM candidates c
    LEFT JOIN email_drafts d ON d.candidate_id = c.id
    WHERE c.id = ${candidateId}
  `) as { applied_role: Role; cv_content: string | null; status: string | null }[];
  if (rows.length === 0) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  const row = rows[0];
  if (row.status === "sent") {
    return NextResponse.json({ error: "Cannot change a draft that has already been sent" }, { status: 409 });
  }
  if (!row.cv_content) {
    return NextResponse.json({ error: "Candidate has no parsed CV content" }, { status: 400 });
  }

  const draft = await generateEmailDraft({
    type,
    cvContent: row.cv_content,
    jobDescription: jobDescriptionFor(row.applied_role),
  });

  await sql`
    INSERT INTO email_drafts (candidate_id, type, subject, body_template)
    VALUES (${candidateId}, ${type}, ${draft.subject}, ${draft.body})
    ON CONFLICT (candidate_id) DO UPDATE
    SET type = EXCLUDED.type, subject = EXCLUDED.subject, body_template = EXCLUDED.body_template,
        edited_body = NULL, status = 'draft', updated_at = now()
  `;

  return NextResponse.json({ ok: true });
}
