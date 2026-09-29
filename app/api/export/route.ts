export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { rankRole } from "@/lib/ranking";
import type { Role } from "@/lib/types";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: NextRequest) {
  const includeContact = req.nextUrl.searchParams.get("includeContact") === "true";
  const roles: Role[] = ["PM", "SPM"];

  const rankMaps = new Map<Role, Map<string, number>>();
  for (const role of roles) {
    const { ranked } = await rankRole(role);
    rankMaps.set(role, new Map(ranked.map((r) => [r.candidate_id, r.rank])));
  }

  const candidateRows = (await sql`
    SELECT c.id, c.applied_role, c.original_filename, c.status,
           p.full_name, p.email, p.phone,
           pm.total_points AS pm_total, spm.total_points AS spm_total,
           d.status AS email_status
    FROM candidates c
    LEFT JOIN candidate_pii p ON p.candidate_id = c.id
    LEFT JOIN candidate_role_totals pm ON pm.candidate_id = c.id AND pm.role = 'PM'
    LEFT JOIN candidate_role_totals spm ON spm.candidate_id = c.id AND spm.role = 'SPM'
    LEFT JOIN email_drafts d ON d.candidate_id = c.id
    ORDER BY c.applied_role, pm_total DESC NULLS LAST
  `) as {
    id: string;
    applied_role: Role;
    original_filename: string;
    status: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    pm_total: string | number | null;
    spm_total: string | number | null;
    email_status: string | null;
  }[];

  const criteriaRows = (await sql`
    SELECT id, role, name, sort_order FROM rubric_criteria ORDER BY role, sort_order
  `) as { id: string; role: Role; name: string; sort_order: number }[];

  const scoreRows = (await sql`
    SELECT candidate_id, role, criterion_id, score FROM scores
  `) as { candidate_id: string; role: Role; criterion_id: string; score: number }[];
  const scoreByKey = new Map(scoreRows.map((s) => [`${s.candidate_id}:${s.criterion_id}`, s.score]));

  const briefRows = (await sql`SELECT candidate_id, role, brief_text FROM briefs`) as {
    candidate_id: string;
    role: Role;
    brief_text: string;
  }[];
  const briefByKey = new Map(briefRows.map((b) => [`${b.candidate_id}:${b.role}`, b.brief_text]));

  const header = [
    "rank",
    "first_name",
    "applied_role",
    "status",
    "pm_total",
    "spm_total",
    ...criteriaRows.map((c) => `${c.role}: ${c.name}`),
    "brief",
    "email_status",
    ...(includeContact ? ["email", "phone"] : []),
  ];

  const lines = [header.map(csvEscape).join(",")];

  for (const c of candidateRows) {
    const rank = rankMaps.get(c.applied_role)?.get(c.id);
    const row = [
      rank !== undefined ? String(rank) : "",
      c.full_name ? c.full_name.trim().split(/\s+/)[0] : "",
      c.applied_role,
      c.status,
      c.pm_total === null ? "" : String(c.pm_total),
      c.spm_total === null ? "" : String(c.spm_total),
      ...criteriaRows.map((crit) => {
        const s = scoreByKey.get(`${c.id}:${crit.id}`);
        return s === undefined ? "" : String(s);
      }),
      briefByKey.get(`${c.id}:${c.applied_role}`) ?? "",
      c.email_status ?? "",
      ...(includeContact ? [c.email ?? "", c.phone ?? ""] : []),
    ];
    lines.push(row.map((v) => csvEscape(String(v))).join(","));
  }

  const csv = lines.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kargo-candidates.csv"`,
    },
  });
}
