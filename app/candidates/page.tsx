"use client";

import { useEffect, useState } from "react";
import type { CandidateListRow } from "@/lib/candidates-list";

export default function CandidatesPage() {
  const [rows, setRows] = useState<CandidateListRow[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [line, setLine] = useState("all");
  const [emailStatus, setEmailStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [rescoring, setRescoring] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (role) params.set("role", role);
    if (line !== "all") params.set("line", line);
    if (emailStatus !== "all") params.set("emailStatus", emailStatus);
    const res = await fetch(`/api/candidates?${params.toString()}`);
    const data = await res.json();
    setRows(data.rows);
    setLoading(false);
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, role, line, emailStatus]);

  async function rescore(id: string) {
    setRescoring(id);
    await fetch(`/api/candidates/${id}/rescore`, { method: "POST" });
    setRescoring(null);
    load();
  }

  async function rescoreAll() {
    const res = await fetch("/api/candidates/rescore-all");
    const { candidateIds } = await res.json();
    for (const id of candidateIds as string[]) {
      setRescoring(id);
      await fetch(`/api/candidates/${id}/rescore`, { method: "POST" });
    }
    setRescoring(null);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">All Candidates</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={rescoreAll}>
            Rescore all
          </button>
          <a className="btn-secondary" href="/api/export">
            Export CSV
          </a>
          <a className="btn-secondary" href="/api/export?includeContact=true">
            Export CSV (with contact)
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          placeholder="Search name or filename"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-64"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm">
          <option value="">All roles</option>
          <option value="PM">PM</option>
          <option value="SPM">SPM</option>
        </select>
        <select value={line} onChange={(e) => setLine(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm">
          <option value="all">Above/below: all</option>
          <option value="above">Above line</option>
          <option value="below">Below line</option>
        </select>
        <select
          value={emailStatus}
          onChange={(e) => setEmailStatus(e.target.value)}
          className="border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="all">Email: all</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-2">Rank</th>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Filename</th>
              <th className="text-left p-2">Role</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">PM total</th>
              <th className="text-left p-2">SPM total</th>
              <th className="text-left p-2">Line</th>
              <th className="text-left p-2">Email</th>
              <th className="text-left p-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-3 text-gray-400" colSpan={10}>
                  Loading...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td className="p-3 text-gray-400" colSpan={10}>
                  No candidates match.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-2">{r.rank ?? "-"}</td>
                <td className="p-2">
                  <a className="hover:underline" href={`/candidate/${r.id}`}>
                    {r.first_name ?? "(unnamed)"}
                  </a>
                </td>
                <td className="p-2 text-gray-500">{r.original_filename}</td>
                <td className="p-2">{r.applied_role}</td>
                <td className="p-2">{r.status}</td>
                <td className="p-2">{r.pmTotal ?? "-"}</td>
                <td className="p-2">{r.spmTotal ?? "-"}</td>
                <td className="p-2">{r.aboveLine === null ? "-" : r.aboveLine ? "above" : "below"}</td>
                <td className="p-2">{r.emailStatus ?? "-"}</td>
                <td className="p-2">
                  <button
                    className="btn-secondary text-xs"
                    disabled={rescoring === r.id}
                    onClick={() => rescore(r.id)}
                  >
                    {rescoring === r.id ? "..." : "Rescore"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
