"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import CandidateCard from "./components/CandidateCard";
import type { CandidateWithScoring, Role } from "@/lib/types";

type Filter = "all" | "unsent" | "sent";

export default function DashboardPage() {
  const [role, setRole] = useState<Role>("PM");
  const [candidates, setCandidates] = useState<CandidateWithScoring[]>([]);
  const [shortlistSize, setShortlistSize] = useState<number>(5);
  const [shortlistInput, setShortlistInput] = useState("5");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/dashboard?role=${role}`);
    const data = await res.json();
    setCandidates(data.candidates);
    setShortlistSize(data.shortlistSize);
    setShortlistInput(String(data.shortlistSize));
    setEmailConfigured(data.emailConfigured);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/role-change
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function saveShortlistSize() {
    const n = parseInt(shortlistInput, 10);
    if (!Number.isInteger(n) || n <= 0 || n === shortlistSize) return;
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortlistSize: n }),
    });
    await load();
  }

  const belowLineUnsent = candidates.filter(
    (c) => !c.aboveLine && c.draft && c.draft.status !== "sent"
  );

  const visible = candidates.filter((c) => {
    if (filter === "unsent") return !c.draft || c.draft.status !== "sent";
    if (filter === "sent") return c.draft?.status === "sent";
    return true;
  });

  async function sendBulkRejections() {
    setBulkSending(true);
    await fetch("/api/send/bulk-rejections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateIds: belowLineUnsent.map((c) => c.candidate.id) }),
    });
    setBulkSending(false);
    setConfirmOpen(false);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(["PM", "SPM"] as Role[]).map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={clsx(
              "px-4 py-1.5 rounded-md text-sm font-medium",
              role === r ? "bg-gray-900 text-white" : "bg-white border border-gray-300"
            )}
          >
            {r === "PM" ? "Product Manager" : "Senior Product Manager"}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2 text-sm">
          <label>Shortlist size (N)</label>
          <input
            type="number"
            min={1}
            value={shortlistInput}
            onChange={(e) => setShortlistInput(e.target.value)}
            onBlur={saveShortlistSize}
            className="w-16 border border-gray-300 rounded-md px-2 py-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {(["all", "unsent", "sent"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              "px-3 py-1 rounded-md text-xs font-medium border",
              filter === f ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-300"
            )}
          >
            {f}
          </button>
        ))}

        <button
          className="btn-danger ml-auto"
          disabled={belowLineUnsent.length === 0 || !emailConfigured}
          title={emailConfigured ? undefined : "Set RESEND_API_KEY to enable sending"}
          onClick={() => setConfirmOpen(true)}
        >
          {emailConfigured
            ? `Send all rejections below the line (${belowLineUnsent.length})`
            : "Email not configured"}
        </button>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading...</p>}
      {!loading && visible.length === 0 && (
        <p className="text-sm text-gray-400">No candidates to show.</p>
      )}

      <div className="space-y-3">
        {visible.map((c, i) => (
          <div key={c.candidate.id} className={i === shortlistSize - 1 ? "border-b-4 border-gray-900 pb-3" : ""}>
            <CandidateCard data={c} onChanged={load} emailConfigured={emailConfigured} />
          </div>
        ))}
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="card p-6 max-w-md w-full space-y-4">
            <h2 className="font-semibold">Confirm bulk rejection send</h2>
            <p className="text-sm text-gray-600">
              This will send a rejection email to every one of these {belowLineUnsent.length} candidates below the
              line. This cannot be undone for a candidate once sent.
            </p>
            <ul className="text-sm max-h-48 overflow-y-auto list-disc pl-5">
              {belowLineUnsent.map((c) => (
                <li key={c.candidate.id}>{c.first_name ?? "(unnamed)"}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button className="btn-danger" disabled={bulkSending} onClick={sendBulkRejections}>
                {bulkSending ? "Sending..." : `Send ${belowLineUnsent.length} rejections`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
