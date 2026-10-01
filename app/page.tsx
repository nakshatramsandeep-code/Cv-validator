"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DashboardRow, DashboardStats } from "@/lib/dashboard";

type TierFilter = "all" | "INTERVIEW" | "REVIEW" | "PASS";
type RoleFilter = "both" | "PM" | "SPM";

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card p-4 flex-1 min-w-[120px]">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
        <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
        {label.toUpperCase()}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function TierPill({ tier }: { tier: "INTERVIEW" | "REVIEW" | "PASS" }) {
  const styles = {
    INTERVIEW: "bg-green-100 text-green-800",
    REVIEW: "bg-amber-100 text-amber-800",
    PASS: "bg-gray-100 text-gray-600",
  };
  return <span className={`pill ${styles[tier]}`}>{tier}</span>;
}

function DecisionPill({ decision }: { decision: string }) {
  if (decision === "advance") return <span className="pill-sent">advance</span>;
  if (decision === "reject") return <span className="pill-failed">reject</span>;
  return <span className="pill-draft">pending</span>;
}

export default function DashboardPage() {
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("both");
  const [highPotentialOnly, setHighPotentialOnly] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/dashboard");
    const data = await res.json();
    setRows(data.rows);
    setStats(data.stats);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    load();
  }, []);

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (!r.scoring) return false;
      if (search && !(r.first_name ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      if (tierFilter !== "all" && r.scoring.final_tier !== tierFilter) return false;
      if (roleFilter !== "both" && r.scoring.recommended_role !== roleFilter) return false;
      if (highPotentialOnly && !r.scoring.potential_flag) return false;
      return true;
    });
  }, [rows, search, tierFilter, roleFilter, highPotentialOnly]);

  return (
    <div className="space-y-6">
      <div className="card p-8 bg-gradient-to-br from-indigo-50 to-white">
        <p className="text-xs font-semibold tracking-wide text-indigo-600">KARGO · HIRING</p>
        <h1 className="text-2xl font-semibold mt-1">
          A shortlist <span className="text-indigo-600">Arjun</span> can trust
        </h1>
        <p className="text-sm text-gray-600 mt-2 max-w-xl">
          Ranked by best composite across both roles, scored against the hire pattern, not the job spec. The
          system recommends, you decide, and that decision is the last thing you touch.
        </p>
        <div className="flex gap-2 mt-4">
          <Link href="/upload" className="btn-primary">
            Upload CVs
          </Link>
          <Link href="/pipeline" className="btn-secondary">
            View pipeline
          </Link>
        </div>
      </div>

      {stats && (
        <div className="flex gap-3 flex-wrap">
          <StatCard label="Total scored" value={stats.total} tone="bg-gray-400" />
          <StatCard label="Interview" value={stats.interview} tone="bg-green-500" />
          <StatCard label="Review" value={stats.review} tone="bg-amber-500" />
          <StatCard label="Pass" value={stats.pass} tone="bg-gray-400" />
          <StatCard label="High potential" value={stats.highPotential} tone="bg-purple-500" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          placeholder="Search name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-48"
        />
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as TierFilter)}
          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
        >
          <option value="all">All tiers</option>
          <option value="INTERVIEW">Interview</option>
          <option value="REVIEW">Review</option>
          <option value="PASS">Pass</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
        >
          <option value="both">Both roles</option>
          <option value="PM">Recommended: PM</option>
          <option value="SPM">Recommended: SPM</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={highPotentialOnly}
            onChange={(e) => setHighPotentialOnly(e.target.checked)}
          />
          High-potential flag only
        </label>
        <span className="ml-auto text-xs text-gray-400">
          {visible.length} of {rows.filter((r) => r.scoring).length}
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-2">#</th>
              <th className="text-left p-2">Candidate</th>
              <th className="text-left p-2">Applied</th>
              <th className="text-left p-2">Recommended</th>
              <th className="text-left p-2">Tier</th>
              <th className="text-left p-2">Composite</th>
              <th className="text-left p-2">Pattern</th>
              <th className="text-left p-2">Flags</th>
              <th className="text-left p-2">Decision</th>
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
            {!loading && visible.length === 0 && (
              <tr>
                <td className="p-3 text-gray-400" colSpan={10}>
                  No candidates match.
                </td>
              </tr>
            )}
            {visible.map((r, i) => {
              const s = r.scoring!;
              return (
                <tr key={r.candidate.id} className="border-b last:border-0">
                  <td className="p-2">{i + 1}</td>
                  <td className="p-2">
                    <Link className="hover:underline font-medium" href={`/candidate/${r.candidate.id}`}>
                      {r.first_name ?? "(unnamed)"}
                    </Link>
                  </td>
                  <td className="p-2 text-gray-500">{r.candidate.applied_role ?? "UNSPECIFIED"}</td>
                  <td className="p-2">
                    {s.recommended_role}
                    {s.reroute_suggested && <span className="text-xs text-purple-600 ml-1">reroute?</span>}
                  </td>
                  <td className="p-2">
                    <TierPill tier={s.final_tier} />
                  </td>
                  <td className="p-2 font-medium">{s.best_composite.toFixed(1)}</td>
                  <td className="p-2 text-gray-500">{s.pattern_score.toFixed(1)}</td>
                  <td className="p-2">{s.potential_flag && <span className="pill bg-purple-100 text-purple-800">high potential</span>}</td>
                  <td className="p-2">
                    <DecisionPill decision={r.decision} />
                  </td>
                  <td className="p-2">
                    <Link className="text-blue-600 hover:underline text-xs" href={`/candidate/${r.candidate.id}`}>
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
