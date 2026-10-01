"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import CircularProgress from "./components/CircularProgress";
import type { DashboardRow, DashboardStats } from "@/lib/dashboard";

type TierFilter = "all" | "INTERVIEW" | "REVIEW" | "PASS";
type RoleFilter = "both" | "PM" | "SPM";

const TIER_COLOR: Record<string, string> = {
  INTERVIEW: "#5FAE6F",
  REVIEW: "#F2B84B",
  PASS: "#B9BEC9",
};

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card p-4 flex-1 min-w-[130px]">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone }} />
        {label.toUpperCase()}
      </div>
      <div className="text-2xl font-semibold mt-1 text-gray-900">{value}</div>
    </div>
  );
}

function TierPill({ tier }: { tier: "INTERVIEW" | "REVIEW" | "PASS" }) {
  const styles = {
    INTERVIEW: "bg-accent-soft text-accent-dark",
    REVIEW: "bg-amber-50 text-amber-600",
    PASS: "bg-gray-100 text-gray-500",
  };
  return <span className={`pill ${styles[tier]}`}>{tier}</span>;
}

function DecisionPill({ decision }: { decision: string }) {
  if (decision === "advance") return <span className="pill-sent">advance</span>;
  if (decision === "reject") return <span className="pill-failed">reject</span>;
  return <span className="pill-draft">pending</span>;
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors",
        active ? "bg-primary text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
      )}
    >
      {children}
    </button>
  );
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
      <div className="card p-8 bg-primary text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10" />
        <div className="absolute right-16 bottom-0 h-24 w-24 rounded-full bg-white/10" />
        <p className="text-xs font-semibold tracking-wide text-white/70 relative">KARGO · HIRING</p>
        <h1 className="text-2xl font-semibold mt-1 relative">A shortlist Arjun can trust</h1>
        <p className="text-sm text-white/80 mt-2 max-w-xl relative">
          Ranked by best composite across both roles, scored against the hire pattern, not the job spec. The
          system recommends, you decide, and that decision is the last thing you touch.
        </p>
        <div className="flex gap-2 mt-4 relative">
          <Link href="/upload" className="btn-accent">
            Upload CVs
          </Link>
          <Link href="/pipeline" className="btn bg-white/15 text-white hover:bg-white/25">
            View pipeline
          </Link>
        </div>
      </div>

      {stats && (
        <div className="flex gap-3 flex-wrap">
          <StatCard label="Total scored" value={stats.total} tone="#B9BEC9" />
          <StatCard label="Interview" value={stats.interview} tone="#5FAE6F" />
          <StatCard label="Review" value={stats.review} tone="#F2B84B" />
          <StatCard label="Pass" value={stats.pass} tone="#B9BEC9" />
          <StatCard label="High potential" value={stats.highPotential} tone="#4674F8" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            placeholder="Search name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white border border-gray-200 rounded-full pl-9 pr-4 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-primary-soft"
          />
        </div>

        <FilterPill active={tierFilter === "all"} onClick={() => setTierFilter("all")}>
          All tiers
        </FilterPill>
        <FilterPill active={tierFilter === "INTERVIEW"} onClick={() => setTierFilter("INTERVIEW")}>
          Interview
        </FilterPill>
        <FilterPill active={tierFilter === "REVIEW"} onClick={() => setTierFilter("REVIEW")}>
          Review
        </FilterPill>
        <FilterPill active={tierFilter === "PASS"} onClick={() => setTierFilter("PASS")}>
          Pass
        </FilterPill>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          className="bg-white border border-gray-200 rounded-full px-3.5 py-1.5 text-sm text-gray-600"
        >
          <option value="both">Both roles</option>
          <option value="PM">Recommended: PM</option>
          <option value="SPM">Recommended: SPM</option>
        </select>

        <label className="flex items-center gap-1.5 text-sm text-gray-500 ml-1">
          <input
            type="checkbox"
            checked={highPotentialOnly}
            onChange={(e) => setHighPotentialOnly(e.target.checked)}
            className="rounded accent-primary"
          />
          High-potential only
        </label>

        <span className="ml-auto text-xs text-gray-400">
          {visible.length} of {rows.filter((r) => r.scoring).length}
        </span>
      </div>

      <div className="card divide-y divide-gray-50">
        {loading && <p className="p-6 text-sm text-gray-400">Loading...</p>}
        {!loading && visible.length === 0 && <p className="p-6 text-sm text-gray-400">No candidates match.</p>}
        {visible.map((r, i) => {
          const s = r.scoring!;
          return (
            <div key={r.candidate.id} className="flex items-center gap-4 p-4">
              <span className="text-xs text-gray-300 w-5 shrink-0">{i + 1}</span>

              <div className="icon-badge text-sm font-semibold">
                {(r.first_name ?? "?").slice(0, 1).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <Link href={`/candidate/${r.candidate.id}`} className="font-medium text-sm hover:underline">
                  {r.first_name ?? "(unnamed)"}
                </Link>
                <div className="text-xs text-gray-400 mt-0.5">
                  Applied {r.candidate.applied_role ?? "UNSPECIFIED"} · Recommended {s.recommended_role}
                  {s.reroute_suggested && <span className="text-primary ml-1">reroute?</span>}
                </div>
              </div>

              <div className="hidden md:flex flex-col items-center w-20 shrink-0">
                <span className="text-xs text-gray-400">Pattern</span>
                <span className="text-sm font-medium text-gray-700">{s.pattern_score.toFixed(1)}</span>
              </div>

              <TierPill tier={s.final_tier} />

              {s.potential_flag && <span className="pill bg-primary-soft text-primary">high potential</span>}

              <DecisionPill decision={r.decision} />

              <CircularProgress value={s.best_composite} size={56} stroke={5} color={TIER_COLOR[s.final_tier]} />

              <Link href={`/candidate/${r.candidate.id}`} className="text-primary text-xs font-medium hover:underline shrink-0">
                View →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
