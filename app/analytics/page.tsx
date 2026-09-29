"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsData, RoleAnalytics } from "@/lib/analytics";
import type { Role } from "@/lib/types";

function FunnelTable({ funnel }: { funnel: RoleAnalytics["funnel"] }) {
  const rows: [string, number][] = [
    ["Uploaded", funnel.uploaded],
    ["Scored", funnel.scored],
    ["Above the line", funnel.aboveLine],
    ["Invite sent", funnel.inviteSent],
    ["Rejection sent", funnel.rejectionSent],
    ["Still unsent", funnel.stillUnsent],
  ];
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b last:border-0">
            <td className="py-1.5 text-gray-600">{label}</td>
            <td className="py-1.5 text-right font-medium">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RoleSection({ role, data, shortlistSize }: { role: Role; data: RoleAnalytics; shortlistSize: number }) {
  return (
    <div className="space-y-4">
      <h2 className="font-semibold">{role === "PM" ? "Product Manager" : "Senior Product Manager"}</h2>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-2">Funnel</h3>
          <FunnelTable funnel={data.funnel} />
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-2">Score distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.histogram}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="count" fill="#111827" />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-1">Shortlist line: top {shortlistSize} candidates</p>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-2">Average score per criterion</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.avgPerCriterion} layout="vertical" margin={{ left: 120 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, 5]} fontSize={12} />
            <YAxis type="category" dataKey="criterion" width={160} fontSize={11} />
            <Tooltip />
            <Bar dataKey="average" fill="#2563eb" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-sm text-gray-600">
        Cross-role candidates (applied {role}, also strong for {role === "PM" ? "SPM" : "PM"}):{" "}
        <span className="font-medium">{data.crossRoleCount}</span>
      </p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [shortlistSize, setShortlistSize] = useState(5);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then(setData);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setShortlistSize(s.shortlistSize));
  }, []);

  if (!data) return <p className="text-sm text-gray-400">Loading...</p>;

  return (
    <div className="space-y-10">
      <h1 className="text-xl font-semibold">Analytics</h1>

      <RoleSection role="PM" data={data.PM} shortlistSize={shortlistSize} />
      <RoleSection role="SPM" data={data.SPM} shortlistSize={shortlistSize} />

      <div className="card p-4 space-y-2">
        <h2 className="font-semibold">Processing errors</h2>
        {data.processingErrors.length === 0 && <p className="text-sm text-gray-400">None.</p>}
        <ul className="text-sm divide-y">
          {data.processingErrors.map((e) => (
            <li key={e.id} className="py-2 flex justify-between gap-4">
              <span>{e.original_filename}</span>
              <span className="text-red-600 truncate max-w-md">{e.error_message}</span>
              <a className="text-blue-600 hover:underline whitespace-nowrap" href={`/candidate/${e.id}`}>
                View / retry
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-4">
        <h2 className="font-semibold">Nobody has heard back</h2>
        <p className="text-sm text-gray-600 mt-1">
          Oldest unsent draft:{" "}
          {data.oldestUnsentDraftAgeHours === null
            ? "none pending"
            : `${data.oldestUnsentDraftAgeHours} hours ago`}
        </p>
      </div>
    </div>
  );
}
