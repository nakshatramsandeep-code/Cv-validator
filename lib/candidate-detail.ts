import { sql } from "./db";
import type { Brief, Candidate, CandidatePii, EmailDraft, RedactionReport, Role, Score } from "./types";

export interface CandidateDetail {
  candidate: Candidate;
  pii: Pick<CandidatePii, "full_name">;
  scoresByRole: Record<Role, (Score & { criterion_name: string })[]>;
  totalsByRole: Record<Role, number | null>;
  briefs: Partial<Record<Role, Brief>>;
  draft: EmailDraft | null;
}

export async function getCandidateDetail(candidateId: string): Promise<CandidateDetail | null> {
  const candidateRows = (await sql`SELECT * FROM candidates WHERE id = ${candidateId}`) as Candidate[];
  if (candidateRows.length === 0) return null;
  const candidate = candidateRows[0];

  const piiRows = (await sql`
    SELECT full_name FROM candidate_pii WHERE candidate_id = ${candidateId}
  `) as { full_name: string | null }[];

  const scoreRows = (await sql`
    SELECT s.*, rc.name AS criterion_name FROM scores s
    JOIN rubric_criteria rc ON rc.id = s.criterion_id
    WHERE s.candidate_id = ${candidateId}
    ORDER BY s.role, rc.sort_order
  `) as (Score & { criterion_name: string })[];

  const totalsRows = (await sql`
    SELECT role, total_points FROM candidate_role_totals WHERE candidate_id = ${candidateId}
  `) as { role: Role; total_points: string | number }[];

  const briefRows = (await sql`SELECT * FROM briefs WHERE candidate_id = ${candidateId}`) as Brief[];

  const draftRows = (await sql`
    SELECT * FROM email_drafts WHERE candidate_id = ${candidateId}
  `) as EmailDraft[];

  const scoresByRole: Record<Role, (Score & { criterion_name: string })[]> = { PM: [], SPM: [] };
  for (const s of scoreRows) scoresByRole[s.role].push(s);

  const totalsByRole: Record<Role, number | null> = { PM: null, SPM: null };
  for (const t of totalsRows) totalsByRole[t.role] = Number(t.total_points);

  const briefs: Partial<Record<Role, Brief>> = {};
  for (const b of briefRows) briefs[b.role] = b;

  return {
    candidate,
    pii: { full_name: piiRows[0]?.full_name ?? null },
    scoresByRole,
    totalsByRole,
    briefs,
    draft: draftRows[0] ?? null,
  };
}

export type { RedactionReport };
