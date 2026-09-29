import { sql } from "./db";
import type { Role } from "./types";

export interface RankedCandidate {
  candidate_id: string;
  total_points: number;
  rank: number;
  aboveLine: boolean;
}

export async function getShortlistSize(): Promise<number> {
  const rows = (await sql`SELECT value FROM settings WHERE key = 'shortlist_size'`) as {
    value: string;
  }[];
  const n = rows.length > 0 ? parseInt(rows[0].value, 10) : 5;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/**
 * Ranks every scored candidate who APPLIED for `role` by their total for that
 * role, descending. The top `shortlist_size` are above the line. Ties break by
 * earlier submission (created_at) so the ranking is stable and reproducible.
 */
export async function rankRole(role: Role): Promise<{ ranked: RankedCandidate[]; shortlistSize: number }> {
  const shortlistSize = await getShortlistSize();

  const rows = (await sql`
    SELECT c.id AS candidate_id, COALESCE(t.total_points, 0) AS total_points
    FROM candidates c
    LEFT JOIN candidate_role_totals t ON t.candidate_id = c.id AND t.role = ${role}
    WHERE c.applied_role = ${role} AND c.status = 'scored'
    ORDER BY COALESCE(t.total_points, 0) DESC, c.created_at ASC
  `) as { candidate_id: string; total_points: string | number }[];

  const ranked: RankedCandidate[] = rows.map((r, i) => ({
    candidate_id: r.candidate_id,
    total_points: Number(r.total_points),
    rank: i + 1,
    aboveLine: i < shortlistSize,
  }));

  return { ranked, shortlistSize };
}

export function otherRole(role: Role): Role {
  return role === "PM" ? "SPM" : "PM";
}

/**
 * The set of candidate ids that would rank in `role`'s top N by their `role`
 * total, across EVERY scored candidate regardless of applied_role. Used to
 * flag a candidate who applied for the other role as "also strong for
 * PM/SPM" without an expensive per-candidate query.
 */
export async function crossRoleAboveLineSet(role: Role, shortlistSize: number): Promise<Set<string>> {
  if (shortlistSize <= 0) return new Set();
  const rows = (await sql`
    SELECT c.id AS candidate_id
    FROM candidates c
    JOIN candidate_role_totals t ON t.candidate_id = c.id AND t.role = ${role}
    WHERE c.status = 'scored'
    ORDER BY t.total_points DESC, c.created_at ASC
    LIMIT ${shortlistSize}
  `) as { candidate_id: string }[];
  return new Set(rows.map((r) => r.candidate_id));
}
