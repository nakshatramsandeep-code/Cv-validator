export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { AlreadySentError, EmailNotConfiguredError, sendCandidateEmail } from "@/lib/email";

interface BulkResult {
  candidateId: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
}

/**
 * Sends rejection emails for a client-confirmed list of candidate ids (the
 * confirmation dialog on the dashboard lists every name before this is
 * called). Already-sent drafts are skipped, never re-sent.
 */
export async function POST(req: NextRequest) {
  const { candidateIds } = (await req.json()) as { candidateIds?: string[] };
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    return NextResponse.json({ error: "candidateIds must be a non-empty array" }, { status: 400 });
  }

  const results: BulkResult[] = [];
  for (const candidateId of candidateIds) {
    try {
      const result = await sendCandidateEmail(candidateId);
      results.push({ candidateId, status: result.status, error: result.error });
    } catch (err) {
      if (err instanceof AlreadySentError) {
        results.push({ candidateId, status: "skipped", error: err.message });
      } else if (err instanceof EmailNotConfiguredError) {
        return NextResponse.json({ error: "Email not configured" }, { status: 400 });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ candidateId, status: "failed", error: message });
      }
    }
  }

  return NextResponse.json({ results });
}
