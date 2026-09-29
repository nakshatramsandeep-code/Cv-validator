"use client";

import { useState } from "react";
import type { CandidateWithScoring, EmailType } from "@/lib/types";

function StatusPill({ status }: { status: string | undefined }) {
  if (status === "sent") return <span className="pill-sent">sent</span>;
  if (status === "failed") return <span className="pill-failed">failed</span>;
  return <span className="pill-draft">draft</span>;
}

export default function CandidateCard({
  data,
  onChanged,
  emailConfigured,
}: {
  data: CandidateWithScoring;
  onChanged: () => void;
  emailConfigured: boolean;
}) {
  const { candidate, draft } = data;
  const [body, setBody] = useState(draft?.edited_body ?? draft?.body_template ?? "");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [switching, setSwitching] = useState<EmailType | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const sent = draft?.status === "sent";

  async function saveEdit() {
    if (!draft || sent) return;
    setSaving(true);
    await fetch(`/api/drafts/${candidate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editedBody: body }),
    });
    setSaving(false);
    onChanged();
  }

  async function send() {
    setSending(true);
    setActionError(null);
    const res = await fetch(`/api/send/${candidate.id}`, { method: "POST" });
    const json = await res.json();
    setSending(false);
    if (!res.ok) {
      setActionError(json.error ?? "Send failed");
    }
    onChanged();
  }

  async function switchType(type: EmailType) {
    setSwitching(type);
    setActionError(null);
    const res = await fetch(`/api/drafts/${candidate.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    const json = await res.json();
    setSwitching(null);
    if (!res.ok) {
      setActionError(json.error ?? "Could not switch");
    }
    onChanged();
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-lg font-semibold">#{data.rank}</span>
        <a href={`/candidate/${candidate.id}`} className="font-medium hover:underline">
          {data.first_name ?? "(unnamed)"}
        </a>
        <span className="text-sm text-gray-500">{data.appliedTotal}/100</span>
        {data.crossRoleAboveLine && (
          <span className="pill bg-purple-100 text-purple-800">
            Also strong for {candidate.applied_role === "PM" ? "SPM" : "PM"}
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400">{candidate.original_filename}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        {data.scores.map((s) => (
          <div key={s.criterion_id} className="border rounded-md p-2">
            <div className="font-medium text-xs">{s.criterion_name}</div>
            <div className="text-gray-600">
              {s.score}/5 · {Math.round(s.points)} pts
            </div>
            <div className="text-xs text-gray-500 mt-1">{s.reason}</div>
          </div>
        ))}
      </div>

      {data.brief && (
        <div className="bg-gray-50 border rounded-md p-3 text-sm">
          <span className="font-medium text-xs uppercase text-gray-500">Interview brief</span>
          <p className="mt-1">{data.brief.brief_text}</p>
        </div>
      )}

      {draft && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{draft.type === "invite" ? "Invite" : "Rejection"} draft</span>
            <StatusPill status={draft.status} />
            {draft.sent_at && (
              <span className="text-xs text-gray-400">sent {new Date(draft.sent_at).toLocaleString()}</span>
            )}
          </div>
          <div className="text-xs text-gray-500">Subject: {draft.subject}</div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={saveEdit}
            disabled={sent}
            rows={6}
            className="w-full border border-gray-300 rounded-md p-2 text-sm disabled:bg-gray-50"
          />
          {saving && <span className="text-xs text-gray-400">Saving...</span>}
          {actionError && <p className="text-xs text-red-600">{actionError}</p>}

          <div className="flex gap-2">
            <button
              className="btn-primary"
              disabled={sent || sending || !emailConfigured}
              title={emailConfigured ? undefined : "Set RESEND_API_KEY to enable sending"}
              onClick={send}
            >
              {!emailConfigured ? "Email not configured" : sending ? "Sending..." : "Confirm & Send"}
            </button>
            <button
              className="btn-secondary"
              disabled={sent || switching !== null}
              onClick={() => switchType(draft.type === "invite" ? "rejection" : "invite")}
            >
              {switching ? "Switching..." : `Switch to ${draft.type === "invite" ? "rejection" : "invite"}`}
            </button>
            <button
              className="btn-secondary"
              disabled={sent}
              title="Review now, decide later — takes no action"
              onClick={() => {}}
            >
              Hold
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
