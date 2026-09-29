import { notFound } from "next/navigation";
import { getCandidateDetail } from "@/lib/candidate-detail";
import CandidateActions from "./CandidateActions";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getCandidateDetail(id);
  if (!detail) notFound();

  const { candidate, pii, scoresByRole, totalsByRole, briefs, draft } = detail;
  const roles: Role[] = ["PM", "SPM"];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">{pii.full_name ?? "(unnamed)"}</h1>
        <p className="text-sm text-gray-500">
          {candidate.original_filename} · Applied for {candidate.applied_role} · Status: {candidate.status}
        </p>
        {candidate.error_message && <p className="text-sm text-red-600 mt-1">{candidate.error_message}</p>}
      </div>

      <CandidateActions
        candidateId={candidate.id}
        draft={draft}
        emailConfigured={Boolean(process.env.RESEND_API_KEY)}
      />

      <div className="grid md:grid-cols-2 gap-4">
        {roles.map((role) => (
          <div key={role} className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{role} scorecard</h2>
              <span className="text-sm text-gray-500">{totalsByRole[role] ?? "-"}/100</span>
            </div>
            {briefs[role] && (
              <div className="bg-gray-50 border rounded-md p-3 text-sm">{briefs[role]!.brief_text}</div>
            )}
            <div className="space-y-2">
              {scoresByRole[role].map((s) => (
                <div key={s.criterion_id} className="border rounded-md p-2 text-sm">
                  <div className="flex justify-between font-medium">
                    <span>{s.criterion_name}</span>
                    <span>
                      {s.score}/5 · {Math.round(s.points)} pts
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{s.reason}</p>
                </div>
              ))}
              {scoresByRole[role].length === 0 && (
                <p className="text-sm text-gray-400">Not scored yet.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="font-semibold">Redaction report</h2>
        <pre className="text-xs bg-gray-50 p-3 rounded-md overflow-x-auto">
          {JSON.stringify(candidate.pii_redaction_report, null, 2)}
        </pre>
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="font-semibold">Stripped CV content</h2>
        <pre className="text-xs bg-gray-50 p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
          {candidate.cv_content ?? "(none)"}
        </pre>
      </div>
    </div>
  );
}
