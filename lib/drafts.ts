import { sql } from "./db";
import { generateBrief, generateEmailDraft } from "./ai";
import { jobDescriptionFor } from "./job-descriptions";
import { rankRole } from "./ranking";
import type { EmailType, Role } from "./types";

interface ScoredCandidateRow {
  candidate_id: string;
  cv_content: string;
}

async function getScoresForBrief(candidateId: string, role: Role) {
  return (await sql`
    SELECT rc.name AS criterion_name, s.score, s.reason
    FROM scores s
    JOIN rubric_criteria rc ON rc.id = s.criterion_id
    WHERE s.candidate_id = ${candidateId} AND s.role = ${role}
    ORDER BY rc.sort_order
  `) as { criterion_name: string; score: number; reason: string }[];
}

async function ensureBrief(candidateId: string, role: Role, cvContent: string): Promise<void> {
  const existing = await sql`
    SELECT id FROM briefs WHERE candidate_id = ${candidateId} AND role = ${role}
  `;
  if (existing.length > 0) return;

  const scores = await getScoresForBrief(candidateId, role);
  const briefText = await generateBrief({
    cvContent,
    jobDescription: jobDescriptionFor(role),
    scores: scores.map((s) => ({
      criterionName: s.criterion_name,
      score: s.score,
      reason: s.reason,
    })),
  });

  await sql`
    INSERT INTO briefs (candidate_id, role, brief_text)
    VALUES (${candidateId}, ${role}, ${briefText})
  `;
}

async function upsertEmailDraft(
  candidateId: string,
  cvContent: string,
  role: Role,
  desiredType: EmailType
): Promise<void> {
  const existingRows = (await sql`
    SELECT id, type, status FROM email_drafts WHERE candidate_id = ${candidateId}
  `) as { id: string; type: EmailType; status: string }[];

  const existing = existingRows[0];
  if (existing?.status === "sent") return;
  if (existing && existing.type === desiredType) return;

  const draft = await generateEmailDraft({
    type: desiredType,
    cvContent,
    jobDescription: jobDescriptionFor(role),
  });

  if (existing) {
    await sql`
      UPDATE email_drafts
      SET type = ${desiredType}, subject = ${draft.subject}, body_template = ${draft.body},
          edited_body = NULL, status = 'draft', updated_at = now()
      WHERE id = ${existing.id}
    `;
  } else {
    await sql`
      INSERT INTO email_drafts (candidate_id, type, subject, body_template)
      VALUES (${candidateId}, ${desiredType}, ${draft.subject}, ${draft.body})
    `;
  }
}

/**
 * Recomputes ranking for `role` and brings briefs/email drafts up to date:
 * above-the-line candidates without a brief get one; every candidate's draft
 * type is reconciled with their current above/below-line status. A sent draft
 * is never touched. Call after scoring, a rescore, or a shortlist_size change.
 */
export async function regenerateDraftsForRole(role: Role): Promise<void> {
  const { ranked } = await rankRole(role);
  if (ranked.length === 0) return;

  const candidateRows = (await sql`
    SELECT id AS candidate_id, cv_content FROM candidates
    WHERE applied_role = ${role} AND status = 'scored'
  `) as ScoredCandidateRow[];
  const cvById = new Map(candidateRows.map((c) => [c.candidate_id, c.cv_content]));

  for (const entry of ranked) {
    const cvContent = cvById.get(entry.candidate_id);
    if (!cvContent) continue;

    if (entry.aboveLine) {
      await ensureBrief(entry.candidate_id, role, cvContent);
    }

    const desiredType: EmailType = entry.aboveLine ? "invite" : "rejection";
    await upsertEmailDraft(entry.candidate_id, cvContent, role, desiredType);
  }
}
