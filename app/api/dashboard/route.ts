export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDashboardCandidates } from "@/lib/dashboard";

export async function GET() {
  const data = await getDashboardCandidates();
  return NextResponse.json({ ...data, emailConfigured: Boolean(process.env.RESEND_API_KEY) });
}
