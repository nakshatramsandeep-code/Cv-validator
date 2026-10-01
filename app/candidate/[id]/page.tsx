import { notFound } from "next/navigation";
import { getCandidateDetail } from "@/lib/candidate-detail";
import CandidateActions from "./CandidateActions";
import DraftEditor from "./DraftEditor";
import CircularProgress from "../../components/CircularProgress";
import type { CriterionLayer, Score } from "@/lib/types";

export const dynamic = "force-dynamic";

const TIER_COLOR: Record<string, string> = {
  INTERVIEW: "#5FAE6F",
  REVIEW: "#F2B84B",
  PASS: "#B9BEC9",
};

function ScoreRow({ score }: { score: Score }) {
  const confidenceStyle =
    score.confidence === "high"
      ? "text-accent-dark"
      : score.confidence === "medium"
        ? "text-amber-600"
        : "text-gray-400";
  return (
    <div className="border border-gray-100 rounded-xl p-3 text-sm">
      <div className="flex justify-between font-medium">
        <span>
          {score.criterion_code} · {score.criterion_name}
        </span>
        <span className={confidenceStyle}>
          {score.score}/4 · {score.confidence} confidence
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-1">{score.evidence}</p>
    </div>
  );
}

function BriefSections({ markdown }: { markdown: string }) {
  const sections = markdown
    .split(/\n(?=### )/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const [headingLine, ...rest] = section.split("\n");
        const heading = headingLine.replace(/^###\s*/, "");
        return (
          <div key={heading}>
            <h3 className="text-xs font-semibold uppercase text-gray-500">{heading}</h3>
            <div className="text-sm mt-1 whitespace-pre-wrap">{rest.join("\n").trim()}</div>
          </div>
        );
      })}
    </div>
  );
}

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getCandidateDetail(id);
  if (!detail) notFound();

  const { candidate, fullName, scoring, scoresByLayer, brief, decision, draft } = detail;
  const roleLabel: Record<"PM" | "SPM", string> = { PM: "Product Manager fit", SPM: "Senior PM fit" };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {scoring && (
            <CircularProgress
              value={scoring.best_composite}
              size={64}
              stroke={6}
              color={TIER_COLOR[scoring.final_tier]}
            />
          )}
          <div>
            <h1 className="text-xl font-semibold">{fullName ?? "(unnamed)"}</h1>
            <p className="text-sm text-gray-500">
              Applied: {candidate.applied_role ?? "UNSPECIFIED"}
              {candidate.status === "error" && (
                <span className="text-red-600"> · {candidate.error_message}</span>
              )}
            </p>
          </div>
        </div>
        <CandidateActions candidateId={candidate.id} decision={decision} draft={draft} />
      </div>

      {scoring?.guardrail_notes && (
        <div
          className={`card p-3 text-sm ${scoring.potential_flag ? "border border-primary-soft bg-primary-soft" : "bg-gray-50"}`}
        >
          {scoring.guardrail_notes}
        </div>
      )}

      {scoring && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-3">
              <div className="text-xs text-gray-500">Recommended role</div>
              <div className="text-lg font-semibold">
                {scoring.recommended_role}
                {scoring.reroute_suggested && candidate.applied_role && (
                  <span className="text-xs text-primary block font-normal">
                    applied {candidate.applied_role}, better fit {scoring.recommended_role}
                  </span>
                )}
              </div>
            </div>
            <div className="card p-3">
              <div className="text-xs text-gray-500">Final tier</div>
              <div className="text-lg font-semibold">{scoring.final_tier}</div>
            </div>
            <div className="card p-3">
              <div className="text-xs text-gray-500">Pattern score</div>
              <div className="text-lg font-semibold">{scoring.pattern_score.toFixed(1)} / 100</div>
            </div>
          </div>

          {scoring.why_ranked_here && (
            <div className="card p-3">
              <h2 className="text-xs font-semibold uppercase text-gray-500">Why ranked here</h2>
              <p className="text-sm mt-1">{scoring.why_ranked_here}</p>
            </div>
          )}

          <div className="card p-4 space-y-3">
            <h2 className="font-semibold">Layer A — Hire pattern (60% of composite)</h2>
            <div className="space-y-2">
              {scoresByLayer.pattern.map((s) => (
                <ScoreRow key={s.id} score={s} />
              ))}
            </div>
          </div>

          {(["PM", "SPM"] as const).map((role) => {
            const layer: CriterionLayer = role === "PM" ? "role_pm" : "role_spm";
            const composite = role === "PM" ? scoring.composite_pm : scoring.composite_spm;
            const tier = role === "PM" ? scoring.tier_pm : scoring.tier_spm;
            return (
              <div key={role} className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{roleLabel[role]}</h2>
                  <span className="text-sm text-gray-500">
                    Composite {composite.toFixed(1)} · Tier {tier}
                  </span>
                </div>
                <div className="space-y-2">
                  {scoresByLayer[layer].map((s) => (
                    <ScoreRow key={s.id} score={s} />
                  ))}
                </div>
              </div>
            );
          })}

          {scoring.probes && scoring.probes.length > 0 && (
            <div className="card p-4">
              <h2 className="font-semibold mb-2">Probe questions from scoring</h2>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {scoring.probes.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {brief && (
        <div className="card p-4">
          <h2 className="font-semibold mb-2">Interview brief</h2>
          <BriefSections markdown={brief.brief_markdown} />
        </div>
      )}

      <div className="card p-4 space-y-2">
        <h2 className="font-semibold">Shortlist decision (human — the last thing you touch)</h2>
        <p className="text-xs text-gray-500">
          Advance sends the interview invite immediately. Reject sends the rejection immediately. Both go
          straight to the candidate&apos;s stored email the moment you click, no extra confirmation.
        </p>
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="font-semibold">Draft emails</h2>
        <p className="text-xs text-gray-500">
          These send automatically when you Advance or Reject above. You can also edit and send one manually
          here anytime.
        </p>
        {draft ? (
          <DraftEditor candidateId={candidate.id} draft={draft} />
        ) : (
          <p className="text-sm text-gray-400">No draft yet.</p>
        )}
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
