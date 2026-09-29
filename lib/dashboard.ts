import { sql } from "./db";
import { crossRoleAboveLineSet, otherRole, rankRole } from "./ranking";
import type {
  Brief,
  Candidate,
  CandidateWithScoring,
  EmailDraft,
  Role,
  Score,
} from "./types";

/** Assembles the full dashboard payload for one role's tab: ranked, scored candidates with everything needed to render a card. */
export async function getDashboardData(role: Role): Promise<{
  candidates: CandidateWithScoring[];
  shortlistSize: number;
}> {
  const { ranked, shortlistSize } = await rankRole(role);
  if (ranked.length === 0) return { candidates: [], shortlistSize };

  const ids = ranked.map((r) => r.candidate_id);
  const crossSet = await crossRoleAboveLineSet(otherRole(role), shortlistSize);

  const candidateRows = (await sql`
    SELECT * FROM candidates WHERE id = ANY(${ids})
  `) as Candidate[];

  const piiRows = (await sql`
    SELECT candidate_id, full_name FROM candidate_pii WHERE candidate_id = ANY(${ids})
  `) as { candidate_id: string; full_name: string | null }[];

  const scoreRows = (await sql`
    SELECT s.*, rc.name AS criterion_name FROM scores s
    JOIN rubric_criteria rc ON rc.id = s.criterion_id
    WHERE s.candidate_id = ANY(${ids})
    ORDER BY rc.sort_order
  `) as Score[];

  const totalsRows = (await sql`
    SELECT candidate_id, role, total_points FROM candidate_role_totals WHERE candidate_id = ANY(${ids})
  `) as { candidate_id: string; role: Role; total_points: string | number }[];

  const briefRows = (await sql`
    SELECT * FROM briefs WHERE candidate_id = ANY(${ids}) AND role = ${role}
  `) as Brief[];

  const draftRows = (await sql`
    SELECT * FROM email_drafts WHERE candidate_id = ANY(${ids})
  `) as EmailDraft[];

  const candidateById = new Map(candidateRows.map((c) => [c.id, c]));
  const nameById = new Map(piiRows.map((p) => [p.candidate_id, p.full_name]));
  const scoresByCandidate = new Map<string, Score[]>();
  for (const s of scoreRows) {
    if (s.role !== role) continue;
    const list = scoresByCandidate.get(s.candidate_id) ?? [];
    list.push(s);
    scoresByCandidate.set(s.candidate_id, list);
  }
  const totalsByKey = new Map(totalsRows.map((t) => [`${t.candidate_id}:${t.role}`, Number(t.total_points)]));
  const briefByCandidate = new Map(briefRows.map((b) => [b.candidate_id, b]));
  const draftByCandidate = new Map(draftRows.map((d) => [d.candidate_id, d]));

  const candidates: CandidateWithScoring[] = ranked.map((entry) => {
    const candidate = candidateById.get(entry.candidate_id)!;
    return {
      candidate,
      first_name: (nameById.get(entry.candidate_id) ?? "").trim().split(/\s+/)[0] || null,
      pmTotal: totalsByKey.get(`${entry.candidate_id}:PM`) ?? null,
      spmTotal: totalsByKey.get(`${entry.candidate_id}:SPM`) ?? null,
      appliedTotal: entry.total_points,
      scores: scoresByCandidate.get(entry.candidate_id) ?? [],
      brief: briefByCandidate.get(entry.candidate_id) ?? null,
      draft: draftByCandidate.get(entry.candidate_id) ?? null,
      rank: entry.rank,
      aboveLine: entry.aboveLine,
      crossRoleAboveLine: crossSet.has(entry.candidate_id),
    };
  });

  return { candidates, shortlistSize };
}
