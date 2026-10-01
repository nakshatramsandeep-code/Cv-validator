import { sql } from "./db";
import type {
  Brief,
  Candidate,
  CandidateScoring,
  CriterionLayer,
  Decision,
  EmailDraft,
  Score,
} from "./types";

export interface CandidateDetail {
  candidate: Candidate;
  fullName: string | null;
  scoring: CandidateScoring | null;
  scoresByLayer: Record<CriterionLayer, Score[]>;
  brief: Brief | null;
  decision: Decision;
  decisionNote: string | null;
  draft: EmailDraft | null;
}

function parseProbes(raw: unknown): string[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as string[];
  try {
    const parsed = JSON.parse(raw as string);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function getCandidateDetail(candidateId: string): Promise<CandidateDetail | null> {
  const candidateRows = (await sql`SELECT * FROM candidates WHERE id = ${candidateId}`) as Candidate[];
  if (candidateRows.length === 0) return null;
  const candidate = candidateRows[0];

  const piiRows = (await sql`
    SELECT full_name FROM candidate_pii WHERE candidate_id = ${candidateId}
  `) as { full_name: string | null }[];

  const scoringRows = (await sql`
    SELECT * FROM candidate_scoring WHERE candidate_id = ${candidateId}
  `) as Record<string, unknown>[];

  const scoreRows = (await sql`
    SELECT s.*, rc.name AS criterion_name, rc.code AS criterion_code
    FROM scores s
    JOIN rubric_criteria rc ON rc.id = s.criterion_id
    WHERE s.candidate_id = ${candidateId}
    ORDER BY s.layer, rc.sort_order
  `) as Score[];

  const briefRows = (await sql`SELECT * FROM briefs WHERE candidate_id = ${candidateId}`) as Brief[];
  const decisionRows = (await sql`SELECT decision, note FROM decisions WHERE candidate_id = ${candidateId}`) as {
    decision: Decision;
    note: string | null;
  }[];
  const draftRows = (await sql`SELECT * FROM email_drafts WHERE candidate_id = ${candidateId}`) as EmailDraft[];

  const scoresByLayer: Record<CriterionLayer, Score[]> = { pattern: [], role_pm: [], role_spm: [] };
  for (const s of scoreRows) scoresByLayer[s.layer].push(s);

  const sr = scoringRows[0];
  const scoring: CandidateScoring | null = sr
    ? {
        candidate_id: candidateId,
        pattern_score: Number(sr.pattern_score),
        role_score_pm: Number(sr.role_score_pm),
        composite_pm: Number(sr.composite_pm),
        tier_pm: sr.tier_pm as CandidateScoring["tier_pm"],
        role_score_spm: Number(sr.role_score_spm),
        composite_spm: Number(sr.composite_spm),
        tier_spm: sr.tier_spm as CandidateScoring["tier_spm"],
        recommended_role: sr.recommended_role as CandidateScoring["recommended_role"],
        reroute_suggested: Boolean(sr.reroute_suggested),
        best_composite: Number(sr.best_composite),
        final_tier: sr.final_tier as CandidateScoring["final_tier"],
        potential_flag: Boolean(sr.potential_flag),
        potential_reason: sr.potential_reason as string | null,
        guardrail_notes: sr.guardrail_notes as string | null,
        tier_changed: Boolean(sr.tier_changed),
        why_ranked_here: sr.why_ranked_here as string | null,
        probes: parseProbes(sr.probes),
        updated_at: sr.updated_at as string,
      }
    : null;

  return {
    candidate,
    fullName: piiRows[0]?.full_name ?? null,
    scoring,
    scoresByLayer,
    brief: briefRows[0] ?? null,
    decision: decisionRows[0]?.decision ?? "pending",
    decisionNote: decisionRows[0]?.note ?? null,
    draft: draftRows[0] ?? null,
  };
}
