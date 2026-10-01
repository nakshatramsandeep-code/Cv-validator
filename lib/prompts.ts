import type { CriterionLayer, Role, RubricCriterion } from "./types";

/**
 * All AI prompts for the hiring pipeline live in this one file so they can be
 * read and tuned without touching call sites. Every prompt is a pure function
 * of its inputs — no hidden state, no PII (candidate name/email/phone never
 * appear here; cv_content is already stripped before it reaches these).
 */

function layerLabel(layer: CriterionLayer): string {
  if (layer === "pattern") return "hire-pattern";
  if (layer === "role_pm") return "Product Manager role-fit";
  return "Senior Product Manager role-fit";
}

export function scoringSystemPrompt(layer: CriterionLayer): string {
  return `You are scoring a candidate's CV against the ${layerLabel(layer)} criteria for a hiring pipeline at
Kargo, a logistics SaaS company.

Score only from evidence written in the CV. Do not reward certifications, courses, talks,
brand-name employers, degrees/institutes, years of experience or tool lists on their own. If
there is no concrete evidence for a criterion, score it 0 or 1. Never infer from job titles,
company names or credentials alone.

Scoring scale (apply to every criterion, 0-4):
4 = Multiple specific, concrete instances matching the "strong" description
3 = One clear, specific instance
2 = Partial or indirect evidence (adjacent, or described vaguely)
1 = Only a generic claim, no concrete example
0 = No evidence at all

For every criterion also report a confidence level:
"high" = the evidence directly and unambiguously supports the score
"medium" = the evidence is suggestive but requires some interpretation
"low" = the evidence is thin, indirect, or could be read another way

Each evidence field must quote or closely paraphrase the specific line(s) of the CV you used, or
say "not evidenced" if the score is 0. Respond only with JSON matching the provided schema.`;
}

export function scoringUserPrompt(criteria: RubricCriterion[], cvContent: string): string {
  const criteriaBlock = criteria
    .map(
      (c, i) =>
        `${i + 1}. criterion_id: ${c.id} (${c.code})\n   Name: ${c.name}\n   What a strong candidate looks like: ${c.description}`
    )
    .join("\n\n");

  return `CRITERIA:\n${criteriaBlock}\n\nCANDIDATE CV (personal identifying information has already been removed and replaced with [REDACTED]):\n"""\n${cvContent}\n"""\n\nScore the candidate against every criterion listed above.`;
}

export function guardrailSystemPrompt(): string {
  return `You are a second-pass reviewer checking a hiring pipeline's own scoring for problems before a
founder trusts it, at Kargo, a logistics SaaS company.

You are given the per-criterion scores, confidence levels and evidence already produced for one
candidate, plus the composite scores and tiers computed from them. Look specifically for:
- "Hollow scoring": high scores (3-4) backed mostly by "low" or "medium" confidence evidence,
  especially when the evidence for different criteria is suspiciously similar or recycled.
- "Near-miss conditions": a composite within about 2 points of a tier boundary (75 or 50), where
  a reasonable second read of the evidence could plausibly land on the other side.
- Evidence that contradicts itself across criteria.

If you find a real concern, set potential_flag to true, state the specific reason in
potential_reason (reference the criterion/evidence), and set tier_changed to true with a revised
final_tier only if the concern is serious enough to change the tier outright (rare — most concerns
should just be flagged for the human to see, not silently override the tier).

If scores are backed by clear, high-confidence, substantive evidence with no near-miss or hollow
pattern, set potential_flag to false, tier_changed to false, final_tier equal to the given tier,
and write one factual sentence in guardrail_notes explaining why it passed (e.g. "Scores are backed
by high-confidence, substantive evidence across both pattern and role criteria with no hollow
scoring or near-miss conditions detected.").

Respond only with JSON matching the provided schema.`;
}

export function guardrailUserPrompt(params: {
  patternScores: { code: string; score: number; confidence: string; evidence: string }[];
  roleScores: { code: string; score: number; confidence: string; evidence: string }[];
  role: Role;
  compositeForRole: number;
  tierForRole: string;
}): string {
  const fmt = (items: typeof params.patternScores) =>
    items.map((i) => `- ${i.code}: ${i.score}/4 (${i.confidence} confidence) — ${i.evidence}`).join("\n");

  return `PATTERN LAYER SCORES:\n${fmt(params.patternScores)}\n\n${params.role} ROLE-FIT SCORES:\n${fmt(params.roleScores)}\n\nComposite for ${params.role}: ${params.compositeForRole}\nTier for ${params.role}: ${params.tierForRole}\n\nReview these scores for hollow scoring or near-miss conditions.`;
}

export function whyRankedHereSystemPrompt(): string {
  return `You write a single sentence explaining why a candidate landed where they did in a hiring
pipeline's ranking, for Kargo, a logistics SaaS company. You never see the candidate's name, email
or phone number — the CV text you are given has already had personal identifying information
removed and replaced with [REDACTED]. Do not reference [REDACTED] tokens in your output.

Write exactly one sentence, citing their strongest concrete evidence. Respond only with JSON
matching the provided schema.`;
}

export function whyRankedHereUserPrompt(params: {
  cvContent: string;
  topScores: { name: string; score: number; evidence: string }[];
}): string {
  const scoresBlock = params.topScores.map((s) => `- ${s.name} (${s.score}/4): ${s.evidence}`).join("\n");
  return `CANDIDATE CV (PII removed):\n"""\n${params.cvContent}\n"""\n\nSTRONGEST SCORES:\n${scoresBlock}\n\nWrite the one-sentence explanation.`;
}

export function probesSystemPrompt(): string {
  return `You write interview probe questions for a hiring manager at Kargo, a logistics SaaS company, based
on a candidate's scored CV. You never see the candidate's name, email or phone number — the CV text
you are given has already had personal identifying information removed and replaced with
[REDACTED]. Do not reference [REDACTED] tokens in your output.

Write 5-8 specific probe questions, each targeting either: a weakly-evidenced or low-confidence
criterion (to test whether the claim holds up), or a claim worth verifying in more depth. Questions
must be specific to this candidate's actual CV content, not generic interview questions. If the
role requires in-office work in Mumbai, include one question confirming willingness to do that.

Respond only with JSON matching the provided schema.`;
}

export function probesUserPrompt(params: {
  cvContent: string;
  jobDescription: string;
  lowConfidenceScores: { name: string; score: number; confidence: string; evidence: string }[];
}): string {
  const weakBlock = params.lowConfidenceScores
    .map((s) => `- ${s.name}: ${s.score}/4 (${s.confidence}) — ${s.evidence}`)
    .join("\n");
  return `JOB DESCRIPTION (context only):\n"""\n${params.jobDescription}\n"""\n\nCANDIDATE CV (PII removed):\n"""\n${params.cvContent}\n"""\n\nWEAKER OR LOWER-CONFIDENCE SCORES TO PROBE:\n${weakBlock || "(none particularly weak — probe their strongest claims for depth instead)"}\n\nWrite the probe questions.`;
}

export function briefSystemPrompt(): string {
  return `You write a structured interview brief for a hiring manager at Kargo, a logistics SaaS company.
You never see the candidate's name, email or phone number — the CV text you are given has already
had personal identifying information removed and replaced with [REDACTED]. Do not reference
[REDACTED] tokens in your output; write around them.

Write the brief as markdown with exactly these four sections, in this order:
### Summary
One or two sentences on who they are and their standout fit.
### Strengths
2-4 bullet points, each citing specific CV evidence.
### Risks & gaps to probe
1-3 bullet points naming real gaps or unverified claims, grounded in what's missing or weak.
### Suggested focus areas
1-3 bullet points on what the interview should spend time on.

Respond only with JSON matching the provided schema. The brief_markdown field must contain only
these four sections in markdown.`;
}

export function briefUserPrompt(params: {
  cvContent: string;
  jobDescription: string;
  patternScores: { name: string; score: number; evidence: string }[];
  roleScores: { name: string; score: number; evidence: string }[];
  role: Role;
}): string {
  const fmt = (items: typeof params.patternScores) =>
    items.map((s) => `- ${s.name}: ${s.score}/4 — ${s.evidence}`).join("\n");

  return `JOB DESCRIPTION (for context on the role only; do not score against it):\n"""\n${params.jobDescription}\n"""\n\nCANDIDATE CV (PII removed):\n"""\n${params.cvContent}\n"""\n\nHIRE-PATTERN SCORES:\n${fmt(params.patternScores)}\n\n${params.role} ROLE-FIT SCORES:\n${fmt(params.roleScores)}\n\nWrite the structured interview brief for the ${params.role} role.`;
}

export function emailSystemPrompt(type: "invite" | "rejection"): string {
  const shared = `You draft an email from Arjun Mehta, Founder of Kargo, to a job candidate.
You never see the candidate's name, email or phone number — use the literal token {{FIRST_NAME}}
wherever a greeting or name would go (e.g. "Hi {{FIRST_NAME}},"). The CV text you are given has
already had personal identifying information removed and replaced with [REDACTED]; do not
reference [REDACTED] tokens in your output.

The email must be specific to something real in the candidate's background (quote or paraphrase
an actual detail from their CV). Never invent claims not supported by the CV.
Sign off as: Arjun Mehta, Founder, Kargo.

Respond only with JSON matching the provided schema (subject, body).`;

  if (type === "invite") {
    return `${shared}

This is an INVITE email. Tone: warm, specific, proposes a 30-minute conversation, and asks the
candidate for 2-3 time slots that work for them this week. Keep it brief.`;
  }

  return `${shared}

This is a WARM REJECTION email. Tone: warm and respectful. Thank them for applying. Name one
genuine strength from their CV. No generic HR language, no fake promises to "keep their CV on
file" or "reach out in future" unless clearly true, no rubric scores, no internal reasons for
the decision. Kind and brief.`;
}

export function emailUserPrompt(params: {
  type: "invite" | "rejection";
  cvContent: string;
  jobDescription: string;
}): string {
  return `JOB DESCRIPTION (for context on the role only):\n"""\n${params.jobDescription}\n"""\n\nCANDIDATE CV (PII removed):\n"""\n${params.cvContent}\n"""\n\nWrite the ${params.type} email.`;
}
