export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { listCandidates } from "@/lib/candidates-list";
import type { EmailStatus, Role } from "@/lib/types";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const role = sp.get("role") as Role | null;
  const line = sp.get("line") as "above" | "below" | "all" | null;
  const emailStatus = sp.get("emailStatus") as EmailStatus | "all" | null;
  const scoreMin = sp.get("scoreMin");
  const scoreMax = sp.get("scoreMax");

  const rows = await listCandidates({
    search: sp.get("search") ?? undefined,
    role: role ?? undefined,
    line: line ?? "all",
    emailStatus: emailStatus ?? "all",
    scoreMin: scoreMin ? Number(scoreMin) : undefined,
    scoreMax: scoreMax ? Number(scoreMax) : undefined,
  });

  return NextResponse.json({ rows });
}
