"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Decision, EmailDraft } from "@/lib/types";

export default function CandidateActions({
  candidateId,
  decision,
  draft,
}: {
  candidateId: string;
  decision: Decision;
  draft: EmailDraft | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rescore() {
    setBusy("rescore");
    setError(null);
    const res = await fetch(`/api/candidates/${candidateId}/rescore`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (data.status === "error") setError(data.error);
    router.refresh();
  }

  async function decide(next: Decision) {
    setBusy(next);
    setError(null);
    const res = await fetch(`/api/decisions/${candidateId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: next }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) setError(data.error ?? "Could not update decision");
    else if (data.sendError) setError(`Decision saved, but send failed: ${data.sendError}`);
    router.refresh();
  }

  const sent = draft?.status === "sent";

  return (
    <div className="flex flex-col items-end gap-2">
      <button className="btn-secondary" disabled={busy !== null} onClick={rescore}>
        {busy === "rescore" ? "Re-running..." : "Re-run pipeline"}
      </button>
      <div className="flex gap-2">
        {decision !== "advance" && (
          <button className="btn-primary" disabled={busy !== null || sent} onClick={() => decide("advance")}>
            {busy === "advance" ? "Advancing..." : "Advance"}
          </button>
        )}
        {decision !== "reject" && (
          <button className="btn-danger" disabled={busy !== null || sent} onClick={() => decide("reject")}>
            {busy === "reject" ? "Rejecting..." : "Reject"}
          </button>
        )}
        {decision !== "pending" && (
          <button className="btn-secondary" disabled={busy !== null} onClick={() => decide("pending")}>
            {busy === "pending" ? "..." : "Back to pending"}
          </button>
        )}
      </div>
      {error && <span className="text-xs text-red-600 max-w-xs text-right">{error}</span>}
    </div>
  );
}
