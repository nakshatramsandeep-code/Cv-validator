import { sql } from "./db";
import { crossRoleAboveLineSet, otherRole, rankRole } from "./ranking";
import type { Role } from "./types";

export interface RoleFunnel {
  uploaded: number;
  scored: number;
  aboveLine: number;
  inviteSent: number;
  rejectionSent: number;
  stillUnsent: number;
}

export interface RoleAnalytics {
  funnel: RoleFunnel;
  histogram: { bucket: string; count: number }[];
  avgPerCriterion: { criterion: string; average: number }[];
  crossRoleCount: number;
}

export interface AnalyticsData {
  PM: RoleAnalytics;
  SPM: RoleAnalytics;
  processingErrors: { id: string; original_filename: string; error_message: string | null }[];
  oldestUnsentDraftAgeHours: number | null;
}

function bucketLabel(score: number): string {
  const lower = Math.min(90, Math.floor(score / 10) * 10);
  return `${lower}-${lower + 10}`;
}

async function roleAnalytics(role: Role, shortlistSize: number): Promise<RoleAnalytics> {
  const uploadedRows = (await sql`
    SELECT COUNT(*)::int AS n FROM candidates WHERE applied_role = ${role}
  `) as { n: number }[];
  const scoredRows = (await sql`
    SELECT COUNT(*)::int AS n FROM candidates WHERE applied_role = ${role} AND status = 'scored'
  `) as { n: number }[];

  const { ranked } = await rankRole(role);
  const aboveLine = ranked.filter((r) => r.aboveLine).length;

  const draftStatusRows = (await sql`
    SELECT d.type, d.status, COUNT(*)::int AS n
    FROM email_drafts d
    JOIN candidates c ON c.id = d.candidate_id
    WHERE c.applied_role = ${role}
    GROUP BY d.type, d.status
  `) as { type: string; status: string; n: number }[];

  let inviteSent = 0;
  let rejectionSent = 0;
  let stillUnsent = 0;
  for (const r of draftStatusRows) {
    if (r.status === "sent" && r.type === "invite") inviteSent += r.n;
    if (r.status === "sent" && r.type === "rejection") rejectionSent += r.n;
    if (r.status === "draft") stillUnsent += r.n;
  }

  const histogramRows = (await sql`
    SELECT t.total_points FROM candidate_role_totals t
    JOIN candidates c ON c.id = t.candidate_id
    WHERE c.applied_role = ${role} AND t.role = ${role}
  `) as { total_points: string | number }[];

  const buckets = new Map<string, number>();
  for (let b = 0; b < 100; b += 10) buckets.set(`${b}-${b + 10}`, 0);
  for (const row of histogramRows) {
    const label = bucketLabel(Number(row.total_points));
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }
  const histogram = Array.from(buckets.entries()).map(([bucket, count]) => ({ bucket, count }));

  const avgRows = (await sql`
    SELECT rc.name AS criterion, rc.sort_order, AVG(s.score)::float AS average
    FROM scores s
    JOIN rubric_criteria rc ON rc.id = s.criterion_id
    JOIN candidates c ON c.id = s.candidate_id
    WHERE s.role = ${role} AND c.applied_role = ${role}
    GROUP BY rc.name, rc.sort_order
    ORDER BY rc.sort_order
  `) as { criterion: string; average: number }[];

  const crossSet = await crossRoleAboveLineSet(otherRole(role), shortlistSize);
  const roleApplicantIds = new Set(ranked.map((r) => r.candidate_id));
  const crossRoleCount = Array.from(crossSet).filter((id) => roleApplicantIds.has(id)).length;

  return {
    funnel: {
      uploaded: uploadedRows[0]?.n ?? 0,
      scored: scoredRows[0]?.n ?? 0,
      aboveLine,
      inviteSent,
      rejectionSent,
      stillUnsent,
    },
    histogram,
    avgPerCriterion: avgRows.map((r) => ({ criterion: r.criterion, average: Number(r.average) })),
    crossRoleCount,
  };
}

export async function getAnalytics(): Promise<AnalyticsData> {
  const settingsRows = (await sql`SELECT value FROM settings WHERE key = 'shortlist_size'`) as {
    value: string;
  }[];
  const shortlistSize = settingsRows.length > 0 ? parseInt(settingsRows[0].value, 10) : 5;

  const [pm, spm] = await Promise.all([roleAnalytics("PM", shortlistSize), roleAnalytics("SPM", shortlistSize)]);

  const errorRows = (await sql`
    SELECT id, original_filename, error_message FROM candidates WHERE status = 'error' ORDER BY created_at DESC
  `) as { id: string; original_filename: string; error_message: string | null }[];

  const oldestUnsentRows = (await sql`
    SELECT MIN(created_at) AS oldest FROM email_drafts WHERE status = 'draft'
  `) as { oldest: string | null }[];

  let oldestUnsentDraftAgeHours: number | null = null;
  if (oldestUnsentRows[0]?.oldest) {
    const ageMs = Date.now() - new Date(oldestUnsentRows[0].oldest).getTime();
    oldestUnsentDraftAgeHours = Math.round(ageMs / (1000 * 60 * 60));
  }

  return { PM: pm, SPM: spm, processingErrors: errorRows, oldestUnsentDraftAgeHours };
}
