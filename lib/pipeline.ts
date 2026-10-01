import { sql, assertRubricWeightsValid } from "./db";
import { generateBrief, generateProbes, generateWhyRankedHere, runGuardrail, scoreLayer } from "./ai";
import { jobDescriptionFor } from "./job-descriptions";
import { computeCompositeResult, weightedLayerScore } from "./scoring";
import { generateEmailDraft } from "./ai";
import { sendCandidateEmail } from "./email";
import type { ConfidenceLevel, CriterionLayer, Role, RubricCriterion, Tier } from "./types";

async function getCriteria(layer: CriterionLayer): Promise<RubricCriterion[]> {
  return (await sql`
    SELECT id, layer, code, name, description, weight, sort_order
    FROM rubric_criteria WHERE layer = ${layer} ORDER BY sort_order
  `) as unknown as RubricCriterion[];
}

interface StoredScore {
  criterion_id: string;
  code: string;
  name: string;
  score: number;
  confidence: ConfidenceLevel;
  evidence: string;
}

async function scoreAndStoreLayer(
  candidateId: string,
  layer: CriterionLayer,
  cvContent: string
): Promise<{ layerScore: number; scores: StoredScore[] }> {
  const criteria = await getCriteria(layer);
  const items = await scoreLayer(layer, criteria, cvContent);
  const byId = new Map(criteria.map((c) => [c.id, c]));

  await sql`DELETE FROM scores WHERE candidate_id = ${candidateId} AND layer = ${layer}`;

  const stored: StoredScore[] = [];
  for (const item of items) {
    const criterion = byId.get(item.criterion_id);
    if (!criterion) continue;
    await sql`
      INSERT INTO scores (candidate_id, layer, criterion_id, score, confidence, evidence)
      VALUES (${candidateId}, ${layer}, ${item.criterion_id}, ${item.score}, ${item.confidence}, ${item.evidence})
    `;
    stored.push({
      criterion_id: item.criterion_id,
      code: criterion.code,
      name: criterion.name,
      score: item.score,
      confidence: item.confidence,
      evidence: item.evidence,
    });
  }

  const layerScore = weightedLayerScore(
    stored.map((s) => ({ weight: byId.get(s.criterion_id)!.weight, score: s.score }))
  );
  return { layerScore, scores: stored };
}

/** Ensures a decision row exists for a freshly-scored candidate (defaults to pending). */
async function ensureDecisionRow(candidateId: string): Promise<void> {
  await sql`
    INSERT INTO decisions (candidate_id, decision) VALUES (${candidateId}, 'pending')
    ON CONFLICT (candidate_id) DO NOTHING
  `;
}

async function getDecision(candidateId: string): Promise<{ decision: string } | null> {
  const rows = (await sql`SELECT decision FROM decisions WHERE candidate_id = ${candidateId}`) as {
    decision: string;
  }[];
  return rows[0] ?? null;
}

async function logAudit(candidateId: string, event: string, detail: unknown): Promise<void> {
  await sql`
    INSERT INTO audit_log (candidate_id, event, detail) VALUES (${candidateId}, ${event}, ${JSON.stringify(detail)}::jsonb)
  `;
}

/**
 * Scores a candidate against the pattern layer plus both role-fit layers,
 * computes composite/tier deterministically (never by the model), runs the
 * guardrail pass, generates the why-ranked-here line, probe questions and
 * (for INTERVIEW/REVIEW) a structured brief. PASS-tier candidates are
 * rejected immediately with no human click, matching the reference design;
 * INTERVIEW/REVIEW candidates get an invite drafted and wait for a decision.
 */
export async function runScoringPipeline(candidateId: string): Promise<void> {
  const rows = (await sql`
    SELECT id, applied_role, cv_content FROM candidates WHERE id = ${candidateId}
  `) as { id: string; applied_role: Role | null; cv_content: string | null }[];

  if (rows.length === 0) throw new Error("Candidate not found");
  const candidate = rows[0];
  if (!candidate.cv_content) throw new Error("Candidate has no parsed CV content");
  const cvContent = candidate.cv_content;

  try {
    await assertRubricWeightsValid();

    // Independent Gemini calls run in parallel — a Vercel serverless function
    // on the Hobby plan hard-caps at 10s regardless of `maxDuration`, and this
    // pipeline makes several calls per candidate, so sequential awaits risk a
    // timeout that returns Vercel's own (non-JSON) error page.
    const [pattern, rolePm, roleSpm] = await Promise.all([
      scoreAndStoreLayer(candidateId, "pattern", cvContent),
      scoreAndStoreLayer(candidateId, "role_pm", cvContent),
      scoreAndStoreLayer(candidateId, "role_spm", cvContent),
    ]);

    const composite = computeCompositeResult({
      patternScore: pattern.layerScore,
      roleScorePm: rolePm.layerScore,
      roleScoreSpm: roleSpm.layerScore,
      appliedRole: candidate.applied_role,
    });

    const recommendedRoleScores = composite.recommendedRole === "PM" ? rolePm.scores : roleSpm.scores;
    const recommendedComposite =
      composite.recommendedRole === "PM" ? composite.compositePm : composite.compositeSpm;
    const recommendedTier: Tier = composite.recommendedRole === "PM" ? composite.tierPm : composite.tierSpm;

    const allScores = [...pattern.scores, ...recommendedRoleScores];
    const topScores = [...allScores].sort((a, b) => b.score - a.score).slice(0, 3);
    const weakScores = allScores.filter((s) => s.score <= 2 || s.confidence !== "high");

    const [guardrail, whyRankedHere, probes] = await Promise.all([
      runGuardrail({
        patternScores: pattern.scores.map((s) => ({
          code: s.code,
          score: s.score,
          confidence: s.confidence,
          evidence: s.evidence,
        })),
        roleScores: recommendedRoleScores.map((s) => ({
          code: s.code,
          score: s.score,
          confidence: s.confidence,
          evidence: s.evidence,
        })),
        role: composite.recommendedRole,
        compositeForRole: recommendedComposite,
        tierForRole: recommendedTier,
      }),
      generateWhyRankedHere({ cvContent, topScores }),
      generateProbes({
        cvContent,
        jobDescription: jobDescriptionFor(composite.recommendedRole),
        lowConfidenceScores: weakScores,
      }),
    ]);

    const finalTier: Tier = guardrail.tier_changed ? guardrail.final_tier : composite.finalTier;

    await sql`
      INSERT INTO candidate_scoring (
        candidate_id, pattern_score, role_score_pm, composite_pm, tier_pm,
        role_score_spm, composite_spm, tier_spm, recommended_role, reroute_suggested,
        best_composite, final_tier, potential_flag, potential_reason, guardrail_notes,
        tier_changed, why_ranked_here, probes, updated_at
      ) VALUES (
        ${candidateId}, ${pattern.layerScore}, ${rolePm.layerScore}, ${composite.compositePm}, ${composite.tierPm},
        ${roleSpm.layerScore}, ${composite.compositeSpm}, ${composite.tierSpm}, ${composite.recommendedRole}, ${composite.rerouteSuggested},
        ${composite.bestComposite}, ${finalTier}, ${guardrail.potential_flag}, ${guardrail.potential_reason}, ${guardrail.guardrail_notes},
        ${guardrail.tier_changed}, ${whyRankedHere}, ${JSON.stringify(probes)}::jsonb, now()
      )
      ON CONFLICT (candidate_id) DO UPDATE SET
        pattern_score = EXCLUDED.pattern_score, role_score_pm = EXCLUDED.role_score_pm,
        composite_pm = EXCLUDED.composite_pm, tier_pm = EXCLUDED.tier_pm,
        role_score_spm = EXCLUDED.role_score_spm, composite_spm = EXCLUDED.composite_spm, tier_spm = EXCLUDED.tier_spm,
        recommended_role = EXCLUDED.recommended_role, reroute_suggested = EXCLUDED.reroute_suggested,
        best_composite = EXCLUDED.best_composite, final_tier = EXCLUDED.final_tier,
        potential_flag = EXCLUDED.potential_flag, potential_reason = EXCLUDED.potential_reason,
        guardrail_notes = EXCLUDED.guardrail_notes, tier_changed = EXCLUDED.tier_changed,
        why_ranked_here = EXCLUDED.why_ranked_here, probes = EXCLUDED.probes, updated_at = now()
    `;

    await sql`UPDATE candidates SET status = 'scored', error_message = NULL WHERE id = ${candidateId}`;
    await logAudit(candidateId, "scored", { tier: finalTier, potential_flag: guardrail.potential_flag });

    await ensureDecisionRow(candidateId);
    const existingDecision = await getDecision(candidateId);
    const alreadyDecided = existingDecision && existingDecision.decision !== "pending";

    // Brief generation and draft/auto-reject are independent of each other —
    // run them together rather than adding another sequential AI call.
    const briefPromise =
      finalTier === "INTERVIEW" || finalTier === "REVIEW"
        ? generateBrief({
            cvContent,
            jobDescription: jobDescriptionFor(composite.recommendedRole),
            patternScores: pattern.scores.map((s) => ({ name: s.name, score: s.score, evidence: s.evidence })),
            roleScores: recommendedRoleScores.map((s) => ({ name: s.name, score: s.score, evidence: s.evidence })),
            role: composite.recommendedRole,
          }).then(
            (briefMarkdown) => sql`
              INSERT INTO briefs (candidate_id, brief_markdown) VALUES (${candidateId}, ${briefMarkdown})
              ON CONFLICT (candidate_id) DO UPDATE SET brief_markdown = EXCLUDED.brief_markdown, generated_at = now()
            `
          )
        : Promise.resolve();

    const draftPromise = alreadyDecided
      ? Promise.resolve()
      : finalTier === "PASS"
        ? draftAndAutoReject(candidateId, cvContent, composite.recommendedRole)
        : draftInviteOnly(candidateId, cvContent, composite.recommendedRole);

    await Promise.all([briefPromise, draftPromise]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`UPDATE candidates SET status = 'error', error_message = ${message} WHERE id = ${candidateId}`;
    throw err;
  }
}

async function upsertDraft(
  candidateId: string,
  type: "invite" | "rejection",
  draft: { subject: string; body: string }
): Promise<void> {
  await sql`
    INSERT INTO email_drafts (candidate_id, type, subject, body_template)
    VALUES (${candidateId}, ${type}, ${draft.subject}, ${draft.body})
    ON CONFLICT (candidate_id) DO UPDATE
    SET type = EXCLUDED.type, subject = EXCLUDED.subject, body_template = EXCLUDED.body_template,
        edited_body = NULL, status = 'draft', updated_at = now()
  `;
}

async function draftInviteOnly(candidateId: string, cvContent: string, role: Role): Promise<void> {
  const existing = (await sql`SELECT status, type FROM email_drafts WHERE candidate_id = ${candidateId}`) as {
    status: string;
    type: string;
  }[];
  if (existing[0]?.status === "sent") return;

  const draft = await generateEmailDraft({ type: "invite", cvContent, jobDescription: jobDescriptionFor(role) });
  await upsertDraft(candidateId, "invite", draft);
  await logAudit(candidateId, "drafted", { emails: ["invite"] });
}

/** PASS tier: draft and immediately send a rejection, with no human click. */
async function draftAndAutoReject(candidateId: string, cvContent: string, role: Role): Promise<void> {
  const existing = (await sql`SELECT status FROM email_drafts WHERE candidate_id = ${candidateId}`) as {
    status: string;
  }[];
  if (existing[0]?.status === "sent") return;

  const draft = await generateEmailDraft({ type: "rejection", cvContent, jobDescription: jobDescriptionFor(role) });
  await upsertDraft(candidateId, "rejection", draft);
  await logAudit(candidateId, "drafted", { emails: ["rejection"] });

  // Decision reflects the intended outcome regardless of send success — a
  // failed send (e.g. Resend not configured, or test-mode restrictions) can
  // be retried later from the candidate's draft without re-deciding.
  await sql`
    INSERT INTO decisions (candidate_id, decision, note, decided_at) VALUES (${candidateId}, 'reject', 'auto: scored PASS', now())
    ON CONFLICT (candidate_id) DO UPDATE SET decision = 'reject', note = 'auto: scored PASS', decided_at = now()
  `;

  try {
    await sendCandidateEmail(candidateId);
    await logAudit(candidateId, "auto_rejected", {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAudit(candidateId, "email_send_failed", { error: message });
  }
}
