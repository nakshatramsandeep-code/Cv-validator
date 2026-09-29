import { sql, assertRubricWeightsValid } from "./db";
import { scoreCandidate } from "./ai";
import { regenerateDraftsForRole } from "./drafts";
import type { Role, RubricCriterion } from "./types";

async function getCriteria(role: Role): Promise<RubricCriterion[]> {
  return (await sql`
    SELECT id, role, name, description, weight, sort_order
    FROM rubric_criteria WHERE role = ${role} ORDER BY sort_order
  `) as unknown as RubricCriterion[];
}

async function scoreOneRole(candidateId: string, role: Role, cvContent: string): Promise<void> {
  const criteria = await getCriteria(role);
  const items = await scoreCandidate(criteria, cvContent);
  const byId = new Map(criteria.map((c) => [c.id, c]));

  await sql`DELETE FROM scores WHERE candidate_id = ${candidateId} AND role = ${role}`;

  for (const item of items) {
    const criterion = byId.get(item.criterion_id);
    if (!criterion) continue;
    const points = (criterion.weight * item.score) / 5;
    await sql`
      INSERT INTO scores (candidate_id, role, criterion_id, score, reason, points)
      VALUES (${candidateId}, ${role}, ${item.criterion_id}, ${item.score}, ${item.reason}, ${points})
    `;
  }
}

/**
 * Scores a candidate against BOTH rubrics, regardless of applied role, then
 * brings the applied role's ranking/briefs/drafts up to date. On any failure
 * the candidate is marked 'error' with the message shown on their card.
 */
export async function runScoringPipeline(candidateId: string): Promise<void> {
  const rows = (await sql`
    SELECT id, applied_role, cv_content FROM candidates WHERE id = ${candidateId}
  `) as { id: string; applied_role: Role; cv_content: string | null }[];

  if (rows.length === 0) throw new Error("Candidate not found");
  const candidate = rows[0];
  if (!candidate.cv_content) throw new Error("Candidate has no parsed CV content");

  try {
    await assertRubricWeightsValid();
    await scoreOneRole(candidateId, "PM", candidate.cv_content);
    await scoreOneRole(candidateId, "SPM", candidate.cv_content);

    await sql`UPDATE candidates SET status = 'scored', error_message = NULL WHERE id = ${candidateId}`;

    await regenerateDraftsForRole(candidate.applied_role);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`UPDATE candidates SET status = 'error', error_message = ${message} WHERE id = ${candidateId}`;
    throw err;
  }
}
