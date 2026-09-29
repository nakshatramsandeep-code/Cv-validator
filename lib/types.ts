export type Role = "PM" | "SPM";

export type CandidateStatus = "processing" | "scored" | "error";

export type EmailType = "invite" | "rejection";

export type EmailStatus = "draft" | "sent" | "failed";

export interface RubricCriterion {
  id: string;
  role: Role;
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
  applied_role: Role;
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
  role: Role;
  criterion_id: string;
  score: number;
  reason: string;
  points: number;
  /** Joined in for display; not a DB column. */
  criterion_name?: string;
}

export interface Brief {
  id: string;
  candidate_id: string;
  role: Role;
  brief_text: string;
  generated_at: string;
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

export interface CandidateRoleTotal {
  candidate_id: string;
  role: Role;
  total_points: number;
}

/** A fully assembled candidate row for dashboard/table rendering. */
export interface CandidateWithScoring {
  candidate: Candidate;
  first_name: string | null;
  pmTotal: number | null;
  spmTotal: number | null;
  appliedTotal: number | null;
  scores: Score[];
  brief: Brief | null;
  draft: EmailDraft | null;
  rank: number | null;
  aboveLine: boolean;
  crossRoleAboveLine: boolean;
}
