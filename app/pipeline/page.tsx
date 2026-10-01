"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DashboardRow } from "@/lib/dashboard";

const TIER_PILL: Record<string, string> = {
  INTERVIEW: "bg-accent-soft text-accent-dark",
  REVIEW: "bg-amber-50 text-amber-600",
  PASS: "bg-gray-100 text-gray-500",
};

function CandidateRow({
  row,
  actions,
}: {
  row: DashboardRow;
  actions: { label: string; onClick: () => void; busy?: boolean }[];
}) {
  const s = row.scoring!;
  return (
    <div className="flex items-center gap-2 py-2.5 border-b border-gray-50 last:border-0 text-sm">
      <Link href={`/candidate/${row.candidate.id}`} className="font-medium hover:underline flex-1 truncate">
        {row.first_name ?? "(unnamed)"}
      </Link>
      <span className={`pill ${TIER_PILL[s.final_tier] ?? "bg-gray-100 text-gray-500"}`}>{s.final_tier}</span>
      <span className="text-xs text-gray-400">{s.recommended_role}</span>
      <span className="text-xs font-medium w-10 text-right text-gray-700">{s.best_composite.toFixed(1)}</span>
      {actions.map((a) => (
        <button key={a.label} className="btn-secondary text-xs py-1.5 px-3" disabled={a.busy} onClick={a.onClick}>
          {a.busy ? "..." : a.label}
        </button>
      ))}
    </div>
  );
}

export default function PipelinePage() {
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/dashboard");
    const data = await res.json();
    setRows(data.rows.filter((r: DashboardRow) => r.scoring));
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    load();
  }, []);

  async function decide(candidateId: string, decision: "advance" | "reject" | "pending") {
    setBusyId(candidateId);
    await fetch(`/api/decisions/${candidateId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setBusyId(null);
    load();
  }

  const needsReview = rows.filter((r) => r.decision === "pending");
  const advancing = rows.filter((r) => r.decision === "advance");
  const declined = rows.filter((r) => r.decision === "reject");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Hiring pipeline</h1>
        <p className="text-sm text-gray-500">
          Every scored candidate, grouped by where they stand. Moving a card into Advancing or Declined sends
          that candidate&apos;s email immediately, same as the buttons on their page.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading...</p>}

      {!loading && (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="card p-4">
            <h2 className="font-semibold text-sm flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Needs review <span className="text-gray-400 font-normal">{needsReview.length}</span>
            </h2>
            <p className="text-xs text-gray-400 mb-2">Scored, waiting on a shortlist call</p>
            {needsReview.map((r) => (
              <CandidateRow
                key={r.candidate.id}
                row={r}
                actions={[
                  { label: "Advance", onClick: () => decide(r.candidate.id, "advance"), busy: busyId === r.candidate.id },
                  { label: "Reject", onClick: () => decide(r.candidate.id, "reject"), busy: busyId === r.candidate.id },
                ]}
              />
            ))}
            {needsReview.length === 0 && <p className="text-xs text-gray-400">Nothing waiting.</p>}
          </div>

          <div className="card p-4">
            <h2 className="font-semibold text-sm flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Advancing <span className="text-gray-400 font-normal">{advancing.length}</span>
            </h2>
            <p className="text-xs text-gray-400 mb-2">Interview invite sent (or sending)</p>
            {advancing.map((r) => (
              <CandidateRow
                key={r.candidate.id}
                row={r}
                actions={[
                  { label: "Reject", onClick: () => decide(r.candidate.id, "reject"), busy: busyId === r.candidate.id },
                  { label: "Undo", onClick: () => decide(r.candidate.id, "pending"), busy: busyId === r.candidate.id },
                ]}
              />
            ))}
            {advancing.length === 0 && <p className="text-xs text-gray-400">Nobody yet.</p>}
          </div>

          <div className="card p-4">
            <h2 className="font-semibold text-sm flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              Declined <span className="text-gray-400 font-normal">{declined.length}</span>
            </h2>
            <p className="text-xs text-gray-400 mb-2">Rejection sent (or sending)</p>
            <div className="max-h-[32rem] overflow-y-auto">
              {declined.map((r) => (
                <CandidateRow
                  key={r.candidate.id}
                  row={r}
                  actions={[
                    { label: "Advance", onClick: () => decide(r.candidate.id, "advance"), busy: busyId === r.candidate.id },
                    { label: "Undo", onClick: () => decide(r.candidate.id, "pending"), busy: busyId === r.candidate.id },
                  ]}
                />
              ))}
            </div>
            {declined.length === 0 && <p className="text-xs text-gray-400">Nobody yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
