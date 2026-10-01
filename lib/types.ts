export type Role = "PM" | "SPM";

export type CandidateStatus = "processing" | "scored" | "error";

export type EmailType = "invite" | "rejection";

export type EmailStatus = "draft" | "sent" | "failed";

export type CriterionLayer = "pattern" | "role_pm" | "role_spm";

export type ConfidenceLevel = "high" | "medium" | "low";

export type Tier = "INTERVIEW" | "REVIEW" | "PASS";

export type Decision = "pending" | "advance" | "reject";

export interface RubricCriterion {
  id: string;
  layer: CriterionLayer;
  code: string;
  name: string;
  description: string;
  weight: number;
  sort_order: number;
}

export interface RedactionReport {
  name_removed: number;
  emails_removed: number;
  phones_removed: number;
  urls_removed: number;
}

export interface Candidate {
  id: string;
  created_at: string;
  applied_role: Role | null;
  original_filename: string;
  status: CandidateStatus;
  error_message: string | null;
  cv_content: string | null;
  pii_redaction_report: RedactionReport | null;
}

export interface CandidatePii {
  candidate_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface Score {
  id: string;
  candidate_id: string;
  layer: CriterionLayer;
  criterion_id: string;
  score: number;
  confidence: ConfidenceLevel;
  evidence: string;
  criterion_name?: string;
  criterion_code?: string;
}

export interface CandidateScoring {
  candidate_id: string;
  pattern_score: number;
  role_score_pm: number;
  composite_pm: number;
  tier_pm: Tier;
  role_score_spm: number;
  composite_spm: number;
  tier_spm: Tier;
  recommended_role: Role;
  reroute_suggested: boolean;
  best_composite: number;
  final_tier: Tier;
  potential_flag: boolean;
  potential_reason: string | null;
  guardrail_notes: string | null;
  tier_changed: boolean;
  why_ranked_here: string | null;
  probes: string[] | null;
  updated_at: string;
}

export interface Brief {
  candidate_id: string;
  brief_markdown: string;
  generated_at: string;
}

export interface DecisionRecord {
  candidate_id: string;
  decision: Decision;
  note: string | null;
  decided_at: string | null;
}

export interface EmailDraft {
  id: string;
  candidate_id: string;
  type: EmailType;
  subject: string;
  body_template: string;
  edited_body: string | null;
  status: EmailStatus;
  sent_at: string | null;
  resend_message_id: string | null;
  sent_to: string | null;
  created_at: string;
  updated_at: string;
}

/** A fully assembled candidate row for dashboard/table rendering. */
export interface CandidateWithScoring {
  candidate: Candidate;
  first_name: string | null;
  scoring: CandidateScoring | null;
  brief: Brief | null;
  draft: EmailDraft | null;
  decision: Decision;
}
