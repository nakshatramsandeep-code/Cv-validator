"use client";

import { useState } from "react";
import type { EmailDraft } from "@/lib/types";

export default function DraftEditor({ candidateId, draft }: { candidateId: string; draft: EmailDraft }) {
  const [body, setBody] = useState(draft.edited_body ?? draft.body_template);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = draft.status === "sent";

  async function save() {
    if (sent) return;
    setSaving(true);
    await fetch(`/api/drafts/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editedBody: body }),
    });
    setSaving(false);
  }

  async function send() {
    setSending(true);
    setError(null);
    const res = await fetch(`/api/send/${candidateId}`, { method: "POST" });
    const data = await res.json();
    setSending(false);
    if (!res.ok) setError(data.error ?? "Send failed");
    else window.location.reload();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium uppercase text-xs">
          {draft.type === "invite" ? "Interview invite" : "Rejection"}
        </span>
        {sent ? (
          <span className="pill-sent">sent {draft.sent_at && new Date(draft.sent_at).toLocaleString()}</span>
        ) : draft.status === "failed" ? (
          <span className="pill-failed">failed</span>
        ) : (
          <span className="pill-draft">draft</span>
        )}
      </div>
      {draft.status === "failed" && (
        <p className="text-xs text-red-600">
          Last error: email could not be sent. Check RESEND_API_KEY and the Resend account&apos;s sending
          restrictions, then try again.
        </p>
      )}
      <div className="text-xs text-gray-500">To: {draft.sent_to ?? "(candidate's stored email)"}</div>
      <div className="text-xs text-gray-500">Subject: {draft.subject}</div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={save}
        disabled={sent}
        rows={8}
        className="w-full border border-gray-300 rounded-md p-2 text-sm disabled:bg-gray-50"
      />
      {saving && <span className="text-xs text-gray-400">Saving...</span>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-secondary" disabled={sent || saving} onClick={save}>
          Save draft
        </button>
        <button className="btn-primary" disabled={sent || sending} onClick={send}>
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
