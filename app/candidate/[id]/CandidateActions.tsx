"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EmailDraft } from "@/lib/types";

export default function CandidateActions({
  candidateId,
  draft,
  emailConfigured,
}: {
  candidateId: string;
  draft: EmailDraft | null;
  emailConfigured: boolean;
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

  async function send() {
    setBusy("send");
    setError(null);
    const res = await fetch(`/api/send/${candidateId}`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) setError(data.error ?? "Send failed");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button className="btn-secondary" disabled={busy !== null} onClick={rescore}>
        {busy === "rescore" ? "Rescoring..." : "Rescore"}
      </button>
      {draft && (
        <button
          className="btn-primary"
          disabled={busy !== null || draft.status === "sent" || !emailConfigured}
          onClick={send}
        >
          {!emailConfigured
            ? "Email not configured"
            : busy === "send"
              ? "Sending..."
              : draft.status === "sent"
                ? "Already sent"
                : "Confirm & Send"}
        </button>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
