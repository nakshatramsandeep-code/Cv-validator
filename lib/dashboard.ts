import { sql } from "./db";
import type { Candidate, CandidateScoring, Decision, EmailDraft, Role } from "./types";

export interface DashboardRow {
  candidate: Candidate;
  first_name: string | null;
  scoring: CandidateScoring | null;
  decision: Decision;
  draft: EmailDraft | null;
}

export interface DashboardStats {
  total: number;
  interview: number;
  review: number;
  pass: number;
  highPotential: number;
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

/** The full candidate list backing the dashboard table and the pipeline board. */
export async function getDashboardCandidates(): Promise<{ rows: DashboardRow[]; stats: DashboardStats }> {
  const rows = (await sql`
    SELECT
      c.*, p.full_name,
      cs.candidate_id AS cs_candidate_id, cs.pattern_score, cs.role_score_pm, cs.composite_pm, cs.tier_pm,
      cs.role_score_spm, cs.composite_spm, cs.tier_spm, cs.recommended_role, cs.reroute_suggested,
      cs.best_composite, cs.final_tier, cs.potential_flag, cs.potential_reason, cs.guardrail_notes,
      cs.tier_changed, cs.why_ranked_here, cs.probes, cs.updated_at AS scoring_updated_at,
      d.decision,
      e.id AS draft_id, e.type AS draft_type, e.subject AS draft_subject, e.body_template, e.edited_body,
      e.status AS draft_status, e.sent_at, e.resend_message_id, e.sent_to,
      e.created_at AS draft_created_at, e.updated_at AS draft_updated_at
    FROM candidates c
    LEFT JOIN candidate_pii p ON p.candidate_id = c.id
    LEFT JOIN candidate_scoring cs ON cs.candidate_id = c.id
    LEFT JOIN decisions d ON d.candidate_id = c.id
    LEFT JOIN email_drafts e ON e.candidate_id = c.id
    ORDER BY cs.best_composite DESC NULLS LAST, c.created_at DESC
  `) as Record<string, unknown>[];

  const result: DashboardRow[] = rows.map((r) => {
    const candidate: Candidate = {
      id: r.id as string,
      created_at: r.created_at as string,
      applied_role: r.applied_role as Role | null,
      original_filename: r.original_filename as string,
      status: r.status as Candidate["status"],
      error_message: r.error_message as string | null,
      cv_content: r.cv_content as string | null,
      pii_redaction_report: r.pii_redaction_report as Candidate["pii_redaction_report"],
    };

    const scoring: CandidateScoring | null = r.cs_candidate_id
      ? {
          candidate_id: r.cs_candidate_id as string,
          pattern_score: Number(r.pattern_score),
          role_score_pm: Number(r.role_score_pm),
          composite_pm: Number(r.composite_pm),
          tier_pm: r.tier_pm as CandidateScoring["tier_pm"],
          role_score_spm: Number(r.role_score_spm),
          composite_spm: Number(r.composite_spm),
          tier_spm: r.tier_spm as CandidateScoring["tier_spm"],
          recommended_role: r.recommended_role as Role,
          reroute_suggested: Boolean(r.reroute_suggested),
          best_composite: Number(r.best_composite),
          final_tier: r.final_tier as CandidateScoring["final_tier"],
          potential_flag: Boolean(r.potential_flag),
          potential_reason: r.potential_reason as string | null,
          guardrail_notes: r.guardrail_notes as string | null,
          tier_changed: Boolean(r.tier_changed),
          why_ranked_here: r.why_ranked_here as string | null,
          probes: parseProbes(r.probes),
          updated_at: r.scoring_updated_at as string,
        }
      : null;

    const draft: EmailDraft | null = r.draft_id
      ? {
          id: r.draft_id as string,
          candidate_id: candidate.id,
          type: r.draft_type as EmailDraft["type"],
          subject: r.draft_subject as string,
          body_template: r.body_template as string,
          edited_body: r.edited_body as string | null,
          status: r.draft_status as EmailDraft["status"],
          sent_at: r.sent_at as string | null,
          resend_message_id: r.resend_message_id as string | null,
          sent_to: r.sent_to as string | null,
          created_at: r.draft_created_at as string,
          updated_at: r.draft_updated_at as string,
        }
      : null;

    return {
      candidate,
      first_name: ((r.full_name as string | null) ?? "").trim().split(/\s+/)[0] || null,
      scoring,
      decision: (r.decision as Decision) ?? "pending",
      draft,
    };
  });

  const stats: DashboardStats = {
    total: result.filter((r) => r.scoring !== null).length,
    interview: result.filter((r) => r.scoring?.final_tier === "INTERVIEW").length,
    review: result.filter((r) => r.scoring?.final_tier === "REVIEW").length,
    pass: result.filter((r) => r.scoring?.final_tier === "PASS").length,
    highPotential: result.filter((r) => r.scoring?.potential_flag).length,
  };

  return { rows: result, stats };
}
