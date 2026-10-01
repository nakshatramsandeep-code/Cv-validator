import { sql } from "./db";
import { generateEmailDraft } from "./ai";
import { jobDescriptionFor } from "./job-descriptions";
import { sendCandidateEmail } from "./email";
import type { Decision, Role } from "./types";

/**
 * Sets a candidate's shortlist decision. Advance/reject each generate the
 * matching email draft if it doesn't already exist (or doesn't match the
 * decision's type) and send it immediately — one click is the whole action,
 * matching the reference design. "pending" ("Back to pending") only resets
 * the decision record; it never recalls an email that already sent.
 */
export async function setDecision(
  candidateId: string,
  decision: Decision,
  note?: string
): Promise<{ sendError?: string }> {
  if (decision === "pending") {
    await sql`
      INSERT INTO decisions (candidate_id, decision, note, decided_at) VALUES (${candidateId}, 'pending', ${note ?? null}, NULL)
      ON CONFLICT (candidate_id) DO UPDATE SET decision = 'pending', note = ${note ?? null}, decided_at = NULL
    `;
    return {};
  }

  const rows = (await sql`
    SELECT c.applied_role, cs.recommended_role, c.cv_content, d.status AS draft_status, d.type AS draft_type
    FROM candidates c
    LEFT JOIN candidate_scoring cs ON cs.candidate_id = c.id
    LEFT JOIN email_drafts d ON d.candidate_id = c.id
    WHERE c.id = ${candidateId}
  `) as {
    applied_role: Role | null;
    recommended_role: Role | null;
    cv_content: string | null;
    draft_status: string | null;
    draft_type: string | null;
  }[];

  if (rows.length === 0) throw new Error("Candidate not found");
  const row = rows[0];
  if (!row.cv_content) throw new Error("Candidate has no parsed CV content");

  const desiredType = decision === "advance" ? "invite" : "rejection";
  const role = row.recommended_role ?? row.applied_role ?? "PM";

  if (row.draft_status === "sent" && row.draft_type !== desiredType) {
    throw new Error("An email has already been sent for this candidate and cannot be changed");
  }

  if (row.draft_status !== "sent") {
    const draft = await generateEmailDraft({
      type: desiredType,
      cvContent: row.cv_content,
      jobDescription: jobDescriptionFor(role),
    });
    await sql`
      INSERT INTO email_drafts (candidate_id, type, subject, body_template)
      VALUES (${candidateId}, ${desiredType}, ${draft.subject}, ${draft.body})
      ON CONFLICT (candidate_id) DO UPDATE
      SET type = EXCLUDED.type, subject = EXCLUDED.subject, body_template = EXCLUDED.body_template,
          edited_body = NULL, status = 'draft', updated_at = now()
    `;
  }

  await sql`
    INSERT INTO decisions (candidate_id, decision, note, decided_at) VALUES (${candidateId}, ${decision}, ${note ?? null}, now())
    ON CONFLICT (candidate_id) DO UPDATE SET decision = EXCLUDED.decision, note = EXCLUDED.note, decided_at = now()
  `;
  await sql`
    INSERT INTO audit_log (candidate_id, event, detail)
    VALUES (${candidateId}, 'human_decision', ${JSON.stringify({ decision, note: note ?? null })}::jsonb)
  `;

  if (row.draft_status === "sent") return {};

  try {
    await sendCandidateEmail(candidateId);
    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`
      INSERT INTO audit_log (candidate_id, event, detail)
      VALUES (${candidateId}, 'email_send_failed', ${JSON.stringify({ error: message })}::jsonb)
    `;
    return { sendError: message };
  }
}
