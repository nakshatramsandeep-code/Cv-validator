import { sql } from "./db";
import { rankRole } from "./ranking";
import type { Candidate, EmailStatus, Role } from "./types";

export interface CandidateListRow {
  id: string;
  created_at: string;
  applied_role: Role;
  original_filename: string;
  status: Candidate["status"];
  error_message: string | null;
  first_name: string | null;
  pmTotal: number | null;
  spmTotal: number | null;
  rank: number | null;
  aboveLine: boolean | null;
  emailStatus: EmailStatus | null;
}

export interface CandidateListFilters {
  search?: string;
  role?: Role;
  scoreMin?: number;
  scoreMax?: number;
  line?: "above" | "below" | "all";
  emailStatus?: EmailStatus | "all";
}

/** Backs the /candidates search table: every candidate ever uploaded, with rank/line/email status joined in. */
export async function listCandidates(filters: CandidateListFilters): Promise<CandidateListRow[]> {
  const [{ ranked: pmRanked }, { ranked: spmRanked }] = await Promise.all([
    rankRole("PM"),
    rankRole("SPM"),
  ]);
  const rankByRole: Record<Role, Map<string, { rank: number; aboveLine: boolean }>> = {
    PM: new Map(pmRanked.map((r) => [r.candidate_id, r])),
    SPM: new Map(spmRanked.map((r) => [r.candidate_id, r])),
  };

  const rows = (await sql`
    SELECT
      c.id, c.created_at, c.applied_role, c.original_filename, c.status, c.error_message,
      p.full_name,
      pm.total_points AS pm_total,
      spm.total_points AS spm_total,
      d.status AS email_status
    FROM candidates c
    LEFT JOIN candidate_pii p ON p.candidate_id = c.id
    LEFT JOIN candidate_role_totals pm ON pm.candidate_id = c.id AND pm.role = 'PM'
    LEFT JOIN candidate_role_totals spm ON spm.candidate_id = c.id AND spm.role = 'SPM'
    LEFT JOIN email_drafts d ON d.candidate_id = c.id
    ORDER BY c.created_at DESC
  `) as {
    id: string;
    created_at: string;
    applied_role: Role;
    original_filename: string;
    status: Candidate["status"];
    error_message: string | null;
    full_name: string | null;
    pm_total: string | number | null;
    spm_total: string | number | null;
    email_status: EmailStatus | null;
  }[];

  let results: CandidateListRow[] = rows.map((r) => {
    const rankEntry = rankByRole[r.applied_role].get(r.id);
    return {
      id: r.id,
      created_at: r.created_at,
      applied_role: r.applied_role,
      original_filename: r.original_filename,
      status: r.status,
      error_message: r.error_message,
      first_name: (r.full_name ?? "").trim().split(/\s+/)[0] || null,
      pmTotal: r.pm_total === null ? null : Number(r.pm_total),
      spmTotal: r.spm_total === null ? null : Number(r.spm_total),
      rank: rankEntry?.rank ?? null,
      aboveLine: rankEntry?.aboveLine ?? null,
      emailStatus: r.email_status,
    };
  });

  if (filters.search) {
    const q = filters.search.toLowerCase();
    results = results.filter(
      (r) =>
        (r.first_name ?? "").toLowerCase().includes(q) ||
        r.original_filename.toLowerCase().includes(q)
    );
  }
  if (filters.role) {
    results = results.filter((r) => r.applied_role === filters.role);
  }
  if (filters.scoreMin !== undefined) {
    results = results.filter((r) => {
      const total = r.applied_role === "PM" ? r.pmTotal : r.spmTotal;
      return total !== null && total >= filters.scoreMin!;
    });
  }
  if (filters.scoreMax !== undefined) {
    results = results.filter((r) => {
      const total = r.applied_role === "PM" ? r.pmTotal : r.spmTotal;
      return total !== null && total <= filters.scoreMax!;
    });
  }
  if (filters.line === "above") {
    results = results.filter((r) => r.aboveLine === true);
  } else if (filters.line === "below") {
    results = results.filter((r) => r.aboveLine === false);
  }
  if (filters.emailStatus && filters.emailStatus !== "all") {
    results = results.filter((r) => r.emailStatus === filters.emailStatus);
  }

  return results;
}
