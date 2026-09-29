export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard";
import type { Role } from "@/lib/types";

export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role") as Role | null;
  if (role !== "PM" && role !== "SPM") {
    return NextResponse.json({ error: "role must be PM or SPM" }, { status: 400 });
  }
  const data = await getDashboardData(role);
  return NextResponse.json({ ...data, emailConfigured: Boolean(process.env.RESEND_API_KEY) });
}
